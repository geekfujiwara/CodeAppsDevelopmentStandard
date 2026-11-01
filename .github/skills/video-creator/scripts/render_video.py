"""Add original-source motion rendering while retaining the existing encoding engine."""

import argparse
import ast
import sys
from PIL import Image
from motion_design import SKILL, motion_frame


def focus_frame(array, segment, seconds, context):
    if segment.get('motion'):
        return motion_frame(Image.fromarray(array).convert('RGB'), segment['motion'], seconds)
    return context['_stock_seg_frame'](array, segment, seconds)


def main():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument('--project')
    _, remaining = parser.parse_known_args()
    sys.argv = [sys.argv[0], *remaining]
    renderer = SKILL / 'scripts' / 'render_preview.py'
    tree = ast.parse(renderer.read_text(encoding='utf-8'), filename=str(renderer))
    replacement = ast.parse('def seg_frame(array, segment, seconds):\n    return _focus_frame(array, segment, seconds, globals())').body[0]
    updated = []
    replaced = 0
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == 'seg_frame':
            node.name = '_stock_seg_frame'
            updated.extend([node, replacement])
            replaced += 1
        else:
            updated.append(node)
    if replaced != 1:
        raise ValueError('Encoding engine must expose exactly one seg_frame function')
    tree.body = updated
    ast.fix_missing_locations(tree)
    context = {'__name__': '__main__', '__file__': str(renderer), '_focus_frame': focus_frame}
    exec(compile(tree, str(renderer), 'exec'), context)


if __name__ == '__main__':
    main()
