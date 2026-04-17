// 繪製運行圖底圖(基礎時間與車站線)
function draw_diagram_background(line_kind, date) {
    Object.entries(OperationLines).forEach(([key, value]) => {
        if (key == line_kind) {
            const width = 1200 * (DiagramHours.length - 1) + 100;                // 運行圖長寬
            const height = value['MAX_X_AXIS'];
            const draw = SVG().addTo('body').size(width, height + 75);           // 設定SVG物件
            const text_spacing_factor = 500;
            const draw_date = Date().toLocaleString();
            const now_time_x_axis = get_now_time_x_axis(0);

            const title = `${value['NAME']} ，日期：${date}，運行圖繪製完成時間：${draw_date}`;        // 運行圖標題文字設定
            add_text(draw, title, 5, 0, null);

            // 小時線
            for (let i = 0; i < DiagramHours.length; i++) {
                let x = 50 + i * 1200;
                let y = 0;
                add_line(draw, x, 50, x, height + 50, "hour_line");

                while (true) {
                    let hour = DiagramHours[i];
                    let hour_text = padStart(hour.toString(), 2, "0");
                    if (hour == 24) {
                        after_midnight = "隔日";
                        css = "hour_midnight";
                    }
                    else {
                        after_midnight = "";
                        css = "hour";
                    }
                    if (y <= height)
                        add_text(draw, `${hour_text}00 ${after_midnight}`, x, y + 30, css);
                    else
                        break;
                    y += text_spacing_factor;
                }
                // 十分鐘線
                if (i != DiagramHours.length - 1) {
                    for (let j = 0; j < 5; j++) {
                        x = 50 + i * 1200 + (j + 1) * 200;
                        if (j != 2)
                            add_line(draw, x, 50, x, height + 50, "min10_line");
                        else
                            add_line(draw, x, 50, x, height + 50, "min30_line");

                        y = 0
                        while (true) {
                            if (y <= height) {
                                if (j != 2)
                                    add_text(draw, `${j + 1}0`, x, y + 30, "min10");
                                else
                                    add_text(draw, `${j + 1}0`, x, y + 30, "min30");
                            }
                            else
                                break;
                            y += text_spacing_factor;
                        }

                    }
                }
            }
            // 車站線
            const stations = LinesStationsForBackground[key];
            Object.entries(stations).forEach(([key1, value1]) => {
                y = value1['SVGYAXIS'] + 50;
                if (value1['ID'] != 'NA')
                    add_line(draw, 50, y, width - 50, y, "station_line");
                else
                    add_line(draw, 50, y, width - 50, y, "station_noserv_line");
                for (let i = 0; i < 31; i++) {
                    if (value1['ID'] != 'NA')
                        add_text(draw, value1['DSC'], 5 + i * 1200, y - 20, "station");
                    else
                        add_text(draw, value1['DSC'], 5 + i * 1200, y - 20, "station_noserv");
                }
            })

            diagram_objects[key] = draw;
            add_line(draw, now_time_x_axis, 50, now_time_x_axis, height + 50, "now_time_line");
        }
    })
}

// 繪製每一個車次線與車次標註文字
function draw_train_path(all_trains_data, realtime_trains) {
    train_segments = [];
    selected_segment_ids = new Set();
    segment_elements = new Map();
    last_manual_selected_segment_id = null;
    route_graph = null;
    wait_edge_elements = new Map();
    selected_segment_blink_visible = true;
    current_time_segment_ids = new Set();
    current_segment_blink_visible = true;

    for (let train_data of all_trains_data) {
        for (let [line_kind, train_no, train_kind, line, line_dir, value] of train_data) {
            if (value.length > 2) {
                // 某些路線車次線分成兩段，找出那些不連續的資料，將車次資料分成兩段分別繪製
                const uncontinuous_index = find_uncontinuous_index(value);
                const section_start_value = value.slice(0, uncontinuous_index);
                const section_end_value = value.slice(uncontinuous_index, value.length);
                let realtime_data;
                if (typeof (realtime_trains) != "undefined" && realtime_trains != null) {
                    realtime_data = realtime_trains.get(train_no);
                }

                if (section_start_value.length > 1)
                    set_path(line_kind, train_no, train_kind, section_start_value);
                if (typeof (realtime_data) != "undefined")
                    mark_realtime_train_position(section_start_value, line_dir, train_kind, realtime_data);

                if (section_end_value.length > 3)
                    set_path(line_kind, train_no + "-End", train_kind, section_end_value);
                if (typeof (realtime_data) != "undefined")
                    mark_realtime_train_position(section_end_value, line_dir, train_kind, realtime_data);
            }
        }
    }

    route_graph = build_route_graph();
    refresh_current_time_segments();
    update_all_segment_highlights();
}

// 找出不連續資料的函式
function find_uncontinuous_index(value) {
    let order_next = value[0][5];
    let index = 0;

    for (const [dsc, id, time, loc, stop, order] of value) {
        if (order == order_next) {
            order_next += 1;
            index += 1;
        }
        else {
            break
        }
    }
    return index;
}

// 車次線資料處理
function set_path(line_kind, train_no, train_kind, value) {
    let path = "M";
    let coordinates = [];
    let path_points = [];
    let style = CarKind[train_kind];
    const diagram_need_stop = find_diagram_need_to_stop(line_kind);

    if (typeof (style) == "undefined") {
        style = "others";
    }

    for (const [dsc, id, time, loc, stop, order] of value) {
        let x = time * 10 - 1200 * DiagramHours[0] + 50;
        let y = loc + 50;
        x = Math.round((x + Number.EPSILON) * 100) / 100;
        y = Math.round((y + Number.EPSILON) * 100) / 100;
        if (stop != -1 || diagram_need_stop.includes(id)) {
            path += x.toString() + ',' + y.toString() + ' ';
            coordinates.push([x, y]);
            path_points.push({
                dsc: dsc,
                id: id,
                time: time,
                loc: loc,
                stop: stop,
                order: order,
                x: x,
                y: y
            });
        }
    }

    let text_position = calculate_text_position(coordinates, style);
    add_path(diagram_objects[line_kind], line_kind, train_no, path, text_position, style);
    add_train_segments(diagram_objects[line_kind], line_kind, train_no, style, path_points);
}

// 計算車次號標註的位置
function calculate_text_position(coordinates, color) {
    let coordinates_pairs_temp = [];
    let coordinates_distance = []; // 用來置放每一個轉折點之間的長度

    for (const iterator of coordinates) {
        if (coordinates_pairs_temp.length === 2) {
            let distance = calculate_distance(coordinates_pairs_temp[0], coordinates_pairs_temp[1]);
            coordinates_distance.push(distance);
            coordinates_pairs_temp[0] = coordinates_pairs_temp[1];
            coordinates_pairs_temp[1] = iterator;
        } else if (coordinates_pairs_temp.length === 1) {
            coordinates_pairs_temp.push(iterator);
        } else if (coordinates_pairs_temp.length === 0) {
            coordinates_pairs_temp.push(iterator);
        }
    }

    if (coordinates_pairs_temp.length == 2) {
        coordinates_distance.push(calculate_distance(coordinates_pairs_temp[0], coordinates_pairs_temp[1]));
    }

    // 標號邏輯，區間車：各段長度長於60，偶數位的進行標註，其他車種：100-500的長度在中間標註，大於500則是在中間標註兩次
    let text_position = []; // 用來置放標號定位點
    let accumulate_dist = 0; // 所有轉折點的長度累進

    if (color === "local") {
        let new_text_position = [];
        for (let item of coordinates_distance) {
            if (item > 60) {
                const pos = accumulate_dist + item / 4;
                text_position.push(pos);
            }
            accumulate_dist += item;
        }

        for (let i = 0; i < text_position.length; i++) {
            if (i % 2 === 0) {
                new_text_position.push(text_position[i]);
            }
        }

        text_position = new_text_position;
    } else {
        for (let item of coordinates_distance) {
            if (item > 60 && item < 100) {
                text_position.push(0);
            } else if (item >= 100 && item <= 500) {
                const pos = accumulate_dist + item / 2;
                text_position.push(pos);
            } else if (item > 500) {
                for (let i = 1; i <= 2; i++) {
                    const pos = accumulate_dist + i * (item / 3);
                    text_position.push(pos);
                }
            }
            accumulate_dist += item;
        }
    }
    return text_position;
}

// 標註列車即時位置
function mark_realtime_train_position(value, line_dir, train_kind, realtime_data) {
    let now_time_x_axis = null;
    let coordinates_all_station = [];
    let style = CarKind[train_kind] + "_mark";
    const diagram_need_stop = find_diagram_need_to_stop(line_kind);

    if (typeof (style) == "undefined") {
        style = "special_mark";
    }

    if (realtime_data.StationID > 0)
        now_time_x_axis = get_now_time_x_axis(realtime_data.DelayTime);

    

    // 將所有車站的位置找出，如果是不會停靠的車站，X軸的點設定NaN缺值
    for (const [dsc, id, time, loc, stop, order] of value) {
        let x = time * 10 - 1200 * DiagramHours[0] + 50;
        let y = loc + 50;
        x = Math.round((x + Number.EPSILON) * 100) / 100;
        y = Math.round((y + Number.EPSILON) * 100) / 100;

        if (stop != -1 || diagram_need_stop.includes(id))
            coordinates_all_station.push([x, y]);
    }

    let start_index = -1;
    let end_index = -1;
    for (let i = 1; i < coordinates_all_station.length; i++) {
        if (coordinates_all_station[i][0] >= now_time_x_axis && coordinates_all_station[0][0] <= now_time_x_axis) {
            end_index = i;
            start_index = end_index - 1;

            axis_x = [coordinates_all_station[start_index][0], now_time_x_axis, coordinates_all_station[end_index][0]];
            axis_y = [coordinates_all_station[start_index][1], NaN, coordinates_all_station[end_index][1]];

            if (axis_x[0] <= axis_x[1] && axis_x[1] <= axis_x[2]) {
                const interpolatedArray = interpolateArray(axis_x, axis_y);
                // console.log(interpolatedArray);

                let mark = diagram_objects[line_kind].circle(10).move(axis_x[1] - 5, interpolatedArray[1] - 5);
                mark.attr({ class: style });
            }
            break;
        }
    }
}

// 增加線條函式，用於直線
function add_line(draw_object, x1, x2, y1, y2, style) {
    const line = draw_object.line(x1, x2, y1, y2);
    line.attr({ class: style });
}

// 增加文字函式
function add_text(draw_object, text_string, x, y, style) {
    const text = draw_object.text(text_string).move(x, y);
    text.attr({ class: style });
}

// 增加折線與文字函式，用於車次線
function add_path(draw_object, line_kind, train_id, path_string, text_position, style) {
    const train_id_text = '#' + line_kind + train_id; // SVG.js 會檢查屬性是不是顏色，故不能單純只是用 #283 用車次號做 ID

    const path = draw_object.path(path_string);
    path.attr({ class: `train-path ${style}`, id: line_kind + train_id });

    // 車次線文字標註(SVG path文字)
    for (const iterator of text_position) {
        const text = draw_object.text(function (add) {
            add.tspan(train_id).dy(-3)
        })
        const textpath = text.path();
        textpath.attr({ href: train_id_text, startOffset: iterator, class: style });
    }
}

function add_train_segments(draw_object, line_kind, train_id, style, path_points) {
    for (let i = 0; i < path_points.length - 1; i++) {
        const start = path_points[i];
        const end = path_points[i + 1];
        const segment_id = `${line_kind}-${train_id}-${i}`;

        const segment = draw_object.line(start.x, start.y, end.x, end.y);
        segment.attr({
            class: `train-segment ${style}`,
            id: segment_id,
            'data-segment-id': segment_id,
            'data-line-kind': line_kind,
            'data-train-id': train_id,
            'data-from-station-id': start.id,
            'data-to-station-id': end.id
        });

        segment.on('mouseover', function (e) {
            if (!selected_segment_ids.has(segment_id)) {
                segment.addClass('segment-hover');
            }
            const tooltip = document.getElementById('segment-tooltip');
            const fromTime = format_minutes(start.time);
            const toTime = format_minutes(end.time);
            tooltip.innerHTML = `車次：${train_id}<br>${start.dsc} ${fromTime} → ${end.dsc} ${toTime}`;
            tooltip.style.display = 'block';
            tooltip.style.left = (e.clientX + 14) + 'px';
            tooltip.style.top = (e.clientY - 40) + 'px';
        });

        segment.on('mousemove', function (e) {
            const tooltip = document.getElementById('segment-tooltip');
            tooltip.style.left = (e.clientX + 14) + 'px';
            tooltip.style.top = (e.clientY - 40) + 'px';
        });

        segment.on('mouseout', function () {
            if (!selected_segment_ids.has(segment_id)) {
                segment.removeClass('segment-hover');
            }
            document.getElementById('segment-tooltip').style.display = 'none';
        });

        segment.on('click', function () {
            handle_segment_click(segment_id);
        });

        segment_elements.set(segment_id, segment);
        train_segments.push({
            id: segment_id,
            line_kind: line_kind,
            train_id: train_id,
            style: style,
            from: start,
            to: end
        });
    }
}

// 線段點擊後的主流程，依設定決定是單獨選取或自動補齊路徑
function handle_segment_click(segment_id) {
    if (selected_segment_ids.has(segment_id)) {
        deselect_segment(segment_id);
        if (last_manual_selected_segment_id === segment_id) {
            last_manual_selected_segment_id = null;
        }
        return;
    }

    if (route_planning_enabled && last_manual_selected_segment_id && last_manual_selected_segment_id !== segment_id) {
        const routeResult = find_segment_route(last_manual_selected_segment_id, segment_id);
        if (routeResult.segmentIds.length > 0 || routeResult.waitEdges.length > 0) {
            for (const routeSegmentId of routeResult.segmentIds) {
                select_segment(routeSegmentId);
            }
            for (const waitEdge of routeResult.waitEdges) {
                select_wait_edge(waitEdge);
            }
            select_segment(segment_id);
        } else {
            select_segment(segment_id);
        }
    } else {
        select_segment(segment_id);
    }

    last_manual_selected_segment_id = segment_id;
}

// 選取指定的列車線段並套用選取樣式
function select_segment(segment_id) {
    const segment = segment_elements.get(segment_id);
    if (!segment || selected_segment_ids.has(segment_id)) {
        return;
    }

    selected_segment_ids.add(segment_id);
    segment.removeClass('segment-hover');
    update_segment_highlight_visual(segment_id);
}

// 取消指定列車線段的選取狀態
function deselect_segment(segment_id) {
    const segment = segment_elements.get(segment_id);
    if (!segment || !selected_segment_ids.has(segment_id)) {
        return;
    }

    selected_segment_ids.delete(segment_id);
    segment.removeClass('segment-hover');
    update_segment_highlight_visual(segment_id);
}

// 依照目前選取與目前時段閃爍狀態，更新單一路段的顯示樣式
function update_segment_highlight_visual(segment_id) {
    const segment = segment_elements.get(segment_id);
    if (!segment) {
        return;
    }

    const isCurrentBlinkTarget = current_segments_blink_enabled
        && selected_segment_ids.has(segment_id)
        && current_time_segment_ids.has(segment_id);
    const shouldShowSelected = selected_segment_ids.has(segment_id)
        && !isCurrentBlinkTarget
        && (!selected_segments_blink_enabled || selected_segment_blink_visible);
    const shouldShowCurrent = isCurrentBlinkTarget && current_segment_blink_visible;

    if (shouldShowSelected || shouldShowCurrent) {
        segment.addClass('segment-selected');
    } else {
        segment.removeClass('segment-selected');
    }
}

// 批次刷新所有需要高亮的路段顯示狀態
function update_all_segment_highlights() {
    const segmentIds = new Set([
        ...selected_segment_ids,
        ...current_time_segment_ids
    ]);

    for (const segment_id of segmentIds) {
        update_segment_highlight_visual(segment_id);
    }

    update_all_wait_edge_visuals();
}

// 切換已選路段的閃爍功能
function set_selected_segments_blink_enabled(enabled) {
    selected_segments_blink_enabled = enabled;
    selected_segment_blink_visible = true;

    if (selected_segment_blink_interval_id) {
        clearInterval(selected_segment_blink_interval_id);
        selected_segment_blink_interval_id = null;
    }

    if (selected_segments_blink_enabled) {
        selected_segment_blink_interval_id = setInterval(toggle_selected_segments_blink_visibility, 500);
    }

    update_all_segment_highlights();
}

// 清除目前所有已選路段與等待線
function clear_all_selected_items() {
    const selectedSegmentIds = Array.from(selected_segment_ids);
    for (const segment_id of selectedSegmentIds) {
        deselect_segment(segment_id);
    }

    const waitEdgeIds = Array.from(wait_edge_elements.keys());
    for (const waitEdgeId of waitEdgeIds) {
        deselect_wait_edge(waitEdgeId);
    }

    last_manual_selected_segment_id = null;
    selected_segment_blink_visible = true;
    update_all_segment_highlights();
}

// 將所有已選路段在顯示與隱藏間切換，重播既有選取動畫
function toggle_selected_segments_blink_visibility() {
    if (!selected_segments_blink_enabled) {
        return;
    }

    selected_segment_blink_visible = !selected_segment_blink_visible;
    update_all_segment_highlights();
}

// 切換目前時段線段的閃爍功能
function set_current_segments_blink_enabled(enabled) {
    current_segments_blink_enabled = is_today_diagram && enabled;
    current_segment_blink_visible = true;

    if (current_segment_blink_interval_id) {
        clearInterval(current_segment_blink_interval_id);
        current_segment_blink_interval_id = null;
    }

    if (current_segment_refresh_interval_id) {
        clearInterval(current_segment_refresh_interval_id);
        current_segment_refresh_interval_id = null;
    }

    if (current_segments_blink_enabled) {
        refresh_current_time_segments();
        current_segment_blink_interval_id = setInterval(toggle_current_segments_blink_visibility, 500);
        current_segment_refresh_interval_id = setInterval(refresh_current_time_segments, 30000);
    }

    update_all_segment_highlights();
}

// 將目前時段線段在顯示與隱藏間切換
function toggle_current_segments_blink_visibility() {
    if (!current_segments_blink_enabled) {
        return;
    }

    current_segment_blink_visible = !current_segment_blink_visible;
    update_all_segment_highlights();
}

// 重新計算目前時間虛線碰到的線段
function refresh_current_time_segments() {
    const affectedSegmentIds = new Set(current_time_segment_ids);

    if (!is_today_diagram || train_segments.length === 0) {
        current_time_segment_ids = new Set();
        for (const segment_id of affectedSegmentIds) {
            update_segment_highlight_visual(segment_id);
        }
        return;
    }

    const nextSegmentIds = find_current_time_segment_ids();
    for (const segment_id of nextSegmentIds) {
        affectedSegmentIds.add(segment_id);
    }

    current_time_segment_ids = nextSegmentIds;
    for (const segment_id of affectedSegmentIds) {
        update_segment_highlight_visual(segment_id);
    }
}

// 找出目前時間虛線碰到的所有車次線段
function find_current_time_segment_ids() {
    const nowTimeXAxis = get_now_time_x_axis(0);
    const segmentIds = new Set();

    for (const segment of train_segments) {
        const minX = Math.min(segment.from.x, segment.to.x);
        const maxX = Math.max(segment.from.x, segment.to.x);

        if (minX <= nowTimeXAxis && nowTimeXAxis <= maxX) {
            segmentIds.add(segment.id);
        }
    }

    return segmentIds;
}

// 以兩次手動點選的線段為端點，計算中間應補上的列車線段與等待線
function find_segment_route(startSegmentId, endSegmentId) {
    if (startSegmentId === endSegmentId) {
        return { segmentIds: [startSegmentId], waitEdges: [] };
    }

    const startSegment = get_segment_by_id(startSegmentId);
    const endSegment = get_segment_by_id(endSegmentId);
    if (!startSegment || !endSegment || !route_graph) {
        return { segmentIds: [], waitEdges: [] };
    }

    const startOptions = get_segment_endpoint_options(startSegment, true);
    const endOptions = get_segment_endpoint_options(endSegment, false);
    let bestResult = null;

    for (const startOption of startOptions) {
        for (const endOption of endOptions) {
            const pathResult = find_shortest_route_between_nodes(startOption.nodeKey, endOption.nodeKey);
            if (!pathResult) {
                continue;
            }

            const totalCost = pathResult.cost + startOption.penalty + endOption.penalty;
            if (!bestResult || totalCost < bestResult.totalCost) {
                bestResult = {
                    totalCost: totalCost,
                    pathEdges: pathResult.pathEdges
                };
            }
        }
    }

    if (!bestResult) {
        return { segmentIds: [], waitEdges: [] };
    }

    const segmentIds = [];
    const waitEdges = [];

    for (const edge of bestResult.pathEdges) {
        if (edge.type === 'travel') {
            if (edge.segmentId !== startSegmentId && edge.segmentId !== endSegmentId) {
                segmentIds.push(edge.segmentId);
            }
        } else if (edge.type === 'wait') {
            waitEdges.push(edge);
        }
    }

    return {
        segmentIds: Array.from(new Set(segmentIds)),
        waitEdges: waitEdges
    };
}

// 建立時間空間圖：列車移動為 travel edge，同站等待為 wait edge
function build_route_graph() {
    const nodeMap = new Map();
    const adjacency = new Map();
    const stationNodeMap = new Map();

    function ensureNode(point) {
        const nodeKey = get_route_node_key(point);
        if (!nodeMap.has(nodeKey)) {
            nodeMap.set(nodeKey, {
                key: nodeKey,
                stationId: point.id,
                time: point.time,
                x: point.x,
                y: point.y
            });
            adjacency.set(nodeKey, []);
        }
        return nodeKey;
    }

    for (const segment of train_segments) {
        const fromNodeKey = ensureNode(segment.from);
        const toNodeKey = ensureNode(segment.to);
        const duration = Math.max(0, segment.to.time - segment.from.time);

        adjacency.get(fromNodeKey).push({
            type: 'travel',
            fromNodeKey: fromNodeKey,
            toNodeKey: toNodeKey,
            cost: build_route_cost(duration, true),
            segmentId: segment.id
        });

        if (!stationNodeMap.has(segment.from.id)) {
            stationNodeMap.set(segment.from.id, new Set());
        }
        if (!stationNodeMap.has(segment.to.id)) {
            stationNodeMap.set(segment.to.id, new Set());
        }
        stationNodeMap.get(segment.from.id).add(fromNodeKey);
        stationNodeMap.get(segment.to.id).add(toNodeKey);
    }

    for (const nodeKeys of stationNodeMap.values()) {
        const orderedNodes = Array.from(nodeKeys)
            .map((nodeKey) => nodeMap.get(nodeKey))
            .sort((a, b) => a.time - b.time);

        for (let i = 0; i < orderedNodes.length - 1; i++) {
            const currentNode = orderedNodes[i];
            const nextNode = orderedNodes[i + 1];
            const waitCost = Math.max(0, nextNode.time - currentNode.time);

            adjacency.get(currentNode.key).push({
                type: 'wait',
                fromNodeKey: currentNode.key,
                toNodeKey: nextNode.key,
                cost: build_route_cost(waitCost, false),
                stationId: currentNode.stationId,
                x1: currentNode.x,
                y1: currentNode.y,
                x2: nextNode.x,
                y2: nextNode.y
            });
        }
    }

    return {
        nodes: nodeMap,
        adjacency: adjacency
    };
}

// 在時間空間圖上以最短路徑找出兩節點間的最佳路線
function find_shortest_route_between_nodes(startNodeKey, endNodeKey) {
    if (startNodeKey === endNodeKey) {
        return { cost: 0, pathEdges: [] };
    }

    const distances = new Map();
    const previous = new Map();
    const pending = new Set(route_graph.nodes.keys());

    for (const nodeKey of pending) {
        distances.set(nodeKey, Number.POSITIVE_INFINITY);
    }
    distances.set(startNodeKey, 0);

    while (pending.size > 0) {
        let currentNodeKey = null;
        let currentDistance = Number.POSITIVE_INFINITY;

        for (const nodeKey of pending) {
            const distance = distances.get(nodeKey);
            if (distance < currentDistance) {
                currentDistance = distance;
                currentNodeKey = nodeKey;
            }
        }

        if (currentNodeKey === null || currentDistance === Number.POSITIVE_INFINITY) {
            break;
        }

        pending.delete(currentNodeKey);
        if (currentNodeKey === endNodeKey) {
            break;
        }

        const edges = route_graph.adjacency.get(currentNodeKey) || [];
        for (const edge of edges) {
            if (!pending.has(edge.toNodeKey)) {
                continue;
            }

            const candidateDistance = currentDistance + edge.cost;
            if (candidateDistance < distances.get(edge.toNodeKey)) {
                distances.set(edge.toNodeKey, candidateDistance);
                previous.set(edge.toNodeKey, {
                    fromNodeKey: currentNodeKey,
                    edge: edge
                });
            }
        }
    }

    if (!previous.has(endNodeKey)) {
        return null;
    }

    const pathEdges = [];
    let currentNodeKey = endNodeKey;
    while (currentNodeKey !== startNodeKey) {
        const step = previous.get(currentNodeKey);
        if (!step) {
            return null;
        }
        pathEdges.push(step.edge);
        currentNodeKey = step.fromNodeKey;
    }

    pathEdges.reverse();
    return {
        cost: distances.get(endNodeKey),
        pathEdges: pathEdges
    };
}

// 為起點與終點線段挑選較合理的接續端點，降低倒退接線的機率
function get_segment_endpoint_options(segment, isStartSegment) {
    const preferredPoint = isStartSegment ? get_later_point(segment.from, segment.to) : get_earlier_point(segment.from, segment.to);
    const alternatePoint = isStartSegment ? get_earlier_point(segment.from, segment.to) : get_later_point(segment.from, segment.to);
    const durationPenalty = build_route_cost(Math.abs(segment.to.time - segment.from.time), true);

    return [
        {
            nodeKey: get_route_node_key(preferredPoint),
            penalty: 0
        },
        {
            nodeKey: get_route_node_key(alternatePoint),
            penalty: durationPenalty
        }
    ];
}

// 繪製並記錄一條可獨立移除的等待線
function select_wait_edge(waitEdge) {
    const waitEdgeId = `${waitEdge.stationId}-${waitEdge.fromNodeKey}-${waitEdge.toNodeKey}`;
    if (wait_edge_elements.has(waitEdgeId)) {
        return;
    }

    const drawObject = diagram_objects[line_kind];
    if (!drawObject) {
        return;
    }

    const waitLine = drawObject.line(waitEdge.x1, waitEdge.y1, waitEdge.x2, waitEdge.y2);
    waitLine.attr({
        class: 'route-wait-edge',
        'data-wait-edge-id': waitEdgeId
    });
    waitLine.on('click', function () {
        deselect_wait_edge(waitEdgeId);
    });
    waitLine.front();
    wait_edge_elements.set(waitEdgeId, waitLine);
    update_wait_edge_visual(waitEdgeId);
}

// 移除指定的等待線
function deselect_wait_edge(waitEdgeId) {
    const waitLine = wait_edge_elements.get(waitEdgeId);
    if (!waitLine) {
        return;
    }

    waitLine.remove();
    wait_edge_elements.delete(waitEdgeId);
}

// 依照目前閃爍狀態更新單一等待線的顯示
function update_wait_edge_visual(waitEdgeId) {
    const waitLine = wait_edge_elements.get(waitEdgeId);
    if (!waitLine) {
        return;
    }

    if (!selected_segments_blink_enabled || selected_segment_blink_visible) {
        waitLine.attr({
            opacity: 1,
            'pointer-events': 'stroke'
        });
    } else {
        waitLine.attr({
            opacity: 0,
            'pointer-events': 'none'
        });
    }
}

// 批次刷新所有等待線的顯示狀態
function update_all_wait_edge_visuals() {
    for (const waitEdgeId of wait_edge_elements.keys()) {
        update_wait_edge_visual(waitEdgeId);
    }
}

// 依線段 ID 取回對應的線段資料
function get_segment_by_id(segmentId) {
    for (const segment of train_segments) {
        if (segment.id === segmentId) {
            return segment;
        }
    }
    return null;
}

// 產生時間空間圖節點的唯一鍵值，格式為 車站ID-時間
function get_route_node_key(point) {
    return `${point.id}-${point.time}`;
}

// 回傳兩個端點中時間較早的那一個
function get_earlier_point(pointA, pointB) {
    return pointA.time <= pointB.time ? pointA : pointB;
}

// 回傳兩個端點中時間較晚的那一個
function get_later_point(pointA, pointB) {
    return pointA.time >= pointB.time ? pointA : pointB;
}

// 建立路徑規劃的權重值：先比總時間，再以極小懲罰避免不必要的搭車繞路
function build_route_cost(duration, includesTravel) {
    const timeCost = Math.max(0, duration) * 1000;
    const travelPenalty = includesTravel ? 1 : 0;
    return timeCost + travelPenalty;
}

// 填充文字函式
function padStart(string, targetLength, padString) {
    return padString.repeat(Math.max(0, targetLength - string.length)) + string;
}

// 計算平面上兩點距離函式
function calculate_distance(start, end) {
    const deltaX = end[0] - start[0];
    const deltaY = end[1] - start[1];
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    return distance;
}

// 計算插補資料
function interpolateArray(A, B) {
    const result = [];

    for (let i = 0; i < A.length; i++) {
        if (!isNaN(B[i])) {
            result[i] = B[i];
        } else {
            const referenceValue = A[i];
            let prevIndex = i - 1;
            let nextIndex = i + 1;

            while (isNaN(B[prevIndex]) && prevIndex >= 0) {
                prevIndex--;
            }

            while (isNaN(B[nextIndex]) && nextIndex < A.length) {
                nextIndex++;
            }

            const prevValue = B[prevIndex];
            const nextValue = B[nextIndex];
            const prevDiff = referenceValue - A[prevIndex];
            const nextDiff = A[nextIndex] - referenceValue;
            const totalDiff = prevDiff + nextDiff;

            const value = (prevValue * nextDiff + nextValue * prevDiff) / totalDiff;
            result[i] = Math.round((value + Number.EPSILON) * 100) / 100;
        }
    }

    return result;
}

// 取得現在時間，轉換成X軸
function get_now_time_x_axis(minus_time) {    
    let currentTime = new Date();
    currentTime.setMinutes(currentTime.getMinutes() - minus_time);

    // 取得減去10分鐘後的台北時間
    let options = { timeZone: 'Asia/Taipei', hour12: false };
    let newTime = currentTime.toLocaleString('en-US', options);

    let hours = currentTime.getHours().toString().padStart(2, '0');
    let minutes = currentTime.getMinutes().toString().padStart(2, '0');
    let seconds = currentTime.getSeconds().toString().padStart(2, '0');

    // 將秒調整為最接近的 00 或 30
    seconds = Math.round(seconds / 30) * 30;
    seconds = seconds === 60 ? '00' : seconds.toString().padStart(2, '0');

    const x = SVG_X_Axis[`${hours}:${minutes}:${seconds}`].ax1 * 10 - 1200 * DiagramHours[0] + 50;
    // const x = SVG_X_Axis["15:30:00"].ax1 * 10 - 1200 * DiagramHours[0] + 50;
    return x;
}

function format_minutes(minutes) {
    const h = Math.floor(minutes / 60) % 24;
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// 找出運行圖中必須標註的車站
function find_diagram_need_to_stop(line_kind) {
    let diagram_need_stop = [];
    for (item of LinesStationsForBackground[line_kind]) {
        if (item['TERMINAL'] == 'Y')
            diagram_need_stop.push(item['ID']);
    }
    return diagram_need_stop;
}
