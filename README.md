# ZD TotK Interactive Map -- Filter Markers All Button Behavior

A Tampermonkey userscript that changes the **All** button in **Filter Markers** on [Zelda Dungeon's Tears of the Kingdom interactive map](https://www.zeldadungeon.net/tears-of-the-kingdom-interactive-map).

## Behavior

The map's original All button shows every marker category without selecting the individual filters. eg. Clicking All followed by Well switches to showing only wells, rather than showing all icons then disabling wells.

With this script, All activates and underlines every individual marker filter. eg. Clicking All then Well hides wells while the other categories stay selected. Filters in collapsed groups are included; None keeps its existing behavior.

The script adds no panel, settings button, or other controls. Disabling it in Tampermonkey and reloading the map restores the original button behavior.

## Installation

The installable file is [`filter-markers_all-button-behavior.user.js`](filter-markers_all-button-behavior.user.js).

In Tampermonkey's new-script editor, the complete file contents replace the entire default template, including its header. After saving, reloading the map activates the script. Its name in Installed Userscripts is **ZD TotK Interactive Map -- Filter Markers All Button Behavior**.

## Tests

Node.js 22 or later is needed to run the development tests; no Node.js installation is needed to use the userscript in Tampermonkey.

From the project folder:

```powershell
node prepare-native-filter-fixture.cjs
node --test all-button-behavior.test.cjs
```

The preparation command retrieves a pinned public Zelda Dungeon JavaScript bundle, verifies the extracted filter-control code's SHA-256, and writes a local test fixture. That generated third-party code is excluded from Git and is not covered by this project's MIT license.

The eight regression tests run the site's native filter handlers against a simulated DOM and three simulated map layers. They cover All followed by Well, partial and repeated All selections, None, collapsed groups, saved filter selections, and unrelated controls. The script has also been confirmed working in Tampermonkey; the automated tests do not render the live map.

## License

This project's original code is available under the [MIT license](LICENSE). This is an independent userscript and is not affiliated with Zelda Dungeon or Nintendo.
