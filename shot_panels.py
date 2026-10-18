import asyncio, sys
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 1680, "height": 1000})
        for q, sel, out in [("file=jupiter.json&m=0&t=0.995", "#colR", "v6_radiation_panel_jupiter.png"),
                            ("file=mars.json&m=0&t=0.3", "#colR", "v6_radiation_panel_mars.png"),
                            ("file=jupiter.json&m=0&t=0.5", "#pHz", "v6_hazards_panel_jupiter.png"),
                            ("file=mars.json&m=0&t=0.99", "#pHz", "v6_hazards_panel_mars.png"),
                            ("file=jupiter.json&sort=dose", "#colL", "v6_comparison_sorted_dose_jupiter.png")]:
            await pg.goto("http://127.0.0.1:8817/index.html?" + q + "&still=1"); await pg.wait_for_function("window.stillDone === true", timeout=120000)
            await pg.locator(sel).screenshot(path="screenshots/" + out)
        await b.close()
asyncio.run(main())
