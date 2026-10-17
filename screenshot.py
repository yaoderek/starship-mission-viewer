"""Headless screenshot: python viewer/screenshot.py <url-or-query> <out.png> [width height]"""
import sys, asyncio
from playwright.async_api import async_playwright
async def main(q, out, w=1600, h=950):
    q = q + ("&" if "?" in q else "?") + "still=1"
    url = q if q.startswith("http") else "http://127.0.0.1:8817/index.html" + q
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        mobile = w < 760
        pg = await b.new_page(viewport={"width": w, "height": h}, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
        logs = []; pg.on("console", lambda m: logs.append(m.text)); pg.on("pageerror", lambda e: logs.append("ERR " + str(e)))
        await pg.goto(url); await pg.wait_for_function("window.viewerReady !== undefined"); await pg.evaluate("window.viewerReady")
        await pg.wait_for_timeout(500); await pg.add_style_tag(content="*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important} #panel,#timeline{background:rgba(12,16,28,.86)!important}") if "--noblur" in sys.argv else None; await pg.screenshot(path=out, timeout=120000); await b.close()
        for l in logs: print("console:", l)
asyncio.run(main(sys.argv[1], sys.argv[2], *map(int, [a for a in sys.argv[3:] if a.isdigit()])))
