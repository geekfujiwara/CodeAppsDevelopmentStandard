import argparse
import copy
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
import jsonschema
from shapely.geometry import Polygon, box
from shapely.validation import explain_validity

SCHEMA = json.loads((ROOT / "schema.json").read_text(encoding="utf-8"))


def rotate(point, angle):
    radians = math.radians(angle)
    return [point[0] * math.cos(radians) + point[2] * math.sin(radians), point[1], -point[0] * math.sin(radians) + point[2] * math.cos(radians)]


def ports(node):
    width, height, depth = node["size"]
    kind = node["kind"]
    if kind in ("tank", "tower"):
        values = {"inlet": ([-width / 2, 1, 0], [-1, 0, 0]), "outlet": ([width / 2, 1, 0], [1, 0, 0])}
    elif kind == "pump":
        values = {"inlet": ([-width * .41, .8, 0], [-1, 0, 0]), "outlet": ([-width * .3, 1.475, 0], [0, 1, 0]), "power": ([width * .17, .8, height * .32], [0, 0, 1])}
    elif kind in ("exchanger", "valve"):
        center = height * .65 if kind == "exchanger" else 0
        values = {"inlet": ([-width / 2, center, 0], [-1, 0, 0]), "outlet": ([width / 2, center, 0], [1, 0, 0])}
    else:
        values = {"power": ([0, height / 2, depth / 2], [0, 0, 1])}
    return {name: ([position[axis] + direction[axis] * .35 for axis in range(3)], direction) for name, (position, direction) in values.items()}


def terminal(nodes, reference):
    node = next(node for node in nodes if node["id"] == reference["nodeId"])
    position, direction = ports(node)[reference["portId"]]
    position = rotate(position, node.get("rotation", 0))
    direction = rotate(direction, node.get("rotation", 0))
    return [position[axis] + node["position"][axis] for axis in range(3)], direction


def route_points(nodes, connection):
    source, target = connection["from"], connection["to"]
    if (source["portId"] == "power") != (target["portId"] == "power"):
        raise ValueError("Process/power terminals cannot be mixed")
    start, start_direction = terminal(nodes, source)
    end, end_direction = terminal(nodes, target)
    start_escape = [start[axis] + start_direction[axis] * .7 for axis in range(3)]
    end_escape = [end[axis] + end_direction[axis] * .7 for axis in range(3)]
    elevation, lane = connection["elevation"], connection["lane"]
    points = [start, start_escape, [start_escape[0], elevation, start_escape[2]], [start_escape[0], elevation, lane], [end_escape[0], elevation, lane], [end_escape[0], elevation, end_escape[2]], end_escape, end]
    return [point for index, point in enumerate(points) if index == 0 or math.dist(point, points[index - 1]) > .00001]


def module_for(design, unit):
    return next(module for module in design["modules"] if module["id"] == unit["moduleId"])


def footprint(design, unit):
    module = module_for(design, unit)
    points = []
    for node in module["equipment"]:
        for side_x in (-1, 1):
            for side_z in (-1, 1):
                points.append([node["position"][0] + side_x * (node["size"][0] / 2 + .7), 0, node["position"][2] + side_z * (node["size"][2] / 2 + .7)])
    for connection in module["connections"]:
        points.extend(route_points(module["equipment"], connection))
    world = [[value + unit["position"][axis] for axis, value in enumerate(rotate(point, unit["rotation"]))] for point in points]
    margin = design["site"]["clearance"] / 2 + .15
    return box(min(point[0] for point in world) - margin, min(point[2] for point in world) - margin, max(point[0] for point in world) + margin, max(point[2] for point in world) + margin)


def site_shapes(design):
    site = design["site"]
    rings = [site["boundary"]] + [zone["polygon"] for zone in site["exclusions"]]
    shapes = []
    for ring in rings:
        shape = Polygon(ring)
        if ring[0] != ring[-1] or len(set(map(tuple, ring[:-1]))) != len(ring) - 1 or not shape.is_valid or shape.area <= 0:
            raise ValueError(f"Invalid closed site polygon: {explain_validity(shape)}")
        shapes.append(shape)
    return shapes[0], shapes[1:]


def check_schema(design):
    jsonschema.validate(design, SCHEMA)
    if len(json.dumps(design, ensure_ascii=False).encode()) > 500000:
        raise ValueError("Design exceeds 500 KB")
    groups = [design["modules"], design["units"], design["connections"], design["site"]["exclusions"]]
    groups.extend(module["equipment"] + module["connections"] for module in design["modules"])
    if any(len({item["id"] for item in group}) != len(group) for group in groups):
        raise ValueError("Duplicate IDs")
    if sum(len(module_for(design, unit)["equipment"]) for unit in design["units"]) > 300:
        raise ValueError("Equipment limit is 300")


def external_routes(design):
    nodes = []
    for unit in design["units"]:
        for node in module_for(design, unit)["equipment"]:
            transformed = copy.deepcopy(node)
            transformed["id"] = unit["id"] + "/" + node["id"]
            transformed["position"] = [value + unit["position"][axis] for axis, value in enumerate(rotate(node["position"], unit["rotation"]))]
            transformed["rotation"] = unit["rotation"]
            nodes.append(transformed)
    result = []
    for original in design["connections"]:
        connection = copy.deepcopy(original)
        for endpoint in ("from", "to"):
            terminal_ref = connection[endpoint]
            terminal_ref["nodeId"] = terminal_ref["unitId"] + "/" + terminal_ref["nodeId"]
        result.append(route_points(nodes, connection))
    return result


def route_fits(points, radius, boundary, exclusions):
    for start, end in zip(points, points[1:]):
        segment = box(min(start[0], end[0]) - radius, min(start[2], end[2]) - radius, max(start[0], end[0]) + radius, max(start[2], end[2]) + radius)
        if not boundary.covers(segment) or any(segment.intersection(zone).area > 0 for zone in exclusions):
            return False
    return True


def validate_design(design):
    check_schema(design)
    boundary, exclusions = site_shapes(design)
    occupied = []
    for unit in design["units"]:
        region = footprint(design, unit)
        if not boundary.covers(region):
            raise ValueError(f"Outside site: {unit['id']}")
        if any(region.intersection(zone).area > 0 for zone in exclusions):
            raise ValueError(f"Exclusion overlap: {unit['id']}")
        if any(region.intersection(previous).area > 0 for previous in occupied):
            raise ValueError(f"Unit overlap: {unit['id']}")
        occupied.append(region)
    for connection, points in zip(design["connections"], external_routes(design)):
        if not route_fits(points, .055 if connection["from"]["portId"] == "power" else .12, boundary, exclusions):
            raise ValueError(f"Route outside site or through exclusion: {connection['id']}")


def create_layout(source, requirements=None, step=2):
    design = copy.deepcopy(source)
    if requirements is not None:
        design["site"] = requirements
    check_schema(design)
    boundary, exclusions = site_shapes(design)
    min_x, min_z, max_x, max_z = boundary.bounds
    if step < 1 or step > 20:
        raise ValueError("Grid step must be 1..20 m")
    columns, rows = int((max_x - min_x) / step) + 1, int((max_z - min_z) / step) + 1
    if columns * rows > 10000:
        raise ValueError("Search grid is too large; increase step or reduce site extent")
    positions = [(min_x + column * step, min_z + row * step) for column in range(columns) for row in range(rows)]
    occupied = []
    attempts = 0
    for unit in design["units"]:
        original = copy.deepcopy(unit)
        choices = [(original["position"][0], original["position"][2])] + sorted(positions, key=lambda position: math.dist(position, [original["position"][0], original["position"][2]]))
        placed = False
        for horizontal, vertical in choices:
            for rotation in [original["rotation"]] + [angle for angle in [0, 90, 180, 270] if angle != original["rotation"]]:
                attempts += 1
                if attempts > 30000:
                    raise ValueError("Placement search budget exceeded; revise constraints")
                unit.update(position=[horizontal, 0, vertical], rotation=rotation)
                region = footprint(design, unit)
                if boundary.covers(region) and not any(region.intersection(zone).area > 0 for zone in exclusions + occupied):
                    occupied.append(region)
                    placed = True
                    break
            if placed:
                break
        if not placed:
            raise ValueError(f"No feasible placement found: {unit['id']}; not proof of impossibility")
    for index, connection in enumerate(design["connections"]):
        for lane in [connection["lane"]] + [min_z + offset * step for offset in range(1, rows)]:
            connection["lane"] = lane
            points = external_routes(design)[index]
            if route_fits(points, .055 if connection["from"]["portId"] == "power" else .12, boundary, exclusions):
                break
        else:
            raise ValueError(f"No routing lane found: {connection['id']}")
    validate_design(design)
    return design


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--requirements")
    parser.add_argument("--output")
    parser.add_argument("--layout", action="store_true")
    parser.add_argument("--validate", action="store_true")
    parser.add_argument("--step", type=float, default=2)
    args = parser.parse_args()
    source = Path(args.input)
    if source.stat().st_size > 500000:
        raise ValueError("Input exceeds 500 KB")
    design = json.loads(source.read_text(encoding="utf-8-sig"))
    if args.layout:
        requirements = json.loads(Path(args.requirements).read_text(encoding="utf-8-sig")) if args.requirements else None
        design = create_layout(design, requirements, args.step)
    validate_design(design)
    if args.output:
        with Path(args.output).open("x", encoding="utf-8") as output:
            json.dump(design, output, ensure_ascii=False, indent=2)
    print(json.dumps({"valid": True, "units": len(design["units"]), "connections": len(design["connections"]), "scope": "concept layout; engineering compliance and 3D clashes not evaluated"}))


if __name__ == "__main__":
    main()