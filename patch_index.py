import re

path = "/home/ubuntu/fastroads/index.html"
src = open(path, encoding="utf-8").read()

marker = '<script src="./static/js/main.e7a33c55.chunk.js"></script>'
injection = (
    '<script src="./static/js/main.e7a33c55.chunk.js"></script>\n'
    '<script src="./controls.js"></script>'
)
if marker in src and "controls.js" not in src:
    src = src.replace(marker, injection)
    open(path, "w", encoding="utf-8").write(src)
    print("patched")
else:
    print("already patched or marker missing")
