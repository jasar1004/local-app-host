# Local App Host (PWA)

A small installable web app for keeping and launching static HTML projects on an iPhone. Imported projects and library backups are stored in IndexedDB in the browser on the device. The hosting site serves only the PWA shell; it does not receive imported project files.

## What it supports

- Import one `.html` / `.htm` file.
- Import a standard `.zip` containing an HTML entry point (preferably `index.html`) and its local assets. ZIP entries using Store or Deflate compression are supported; encrypted ZIPs and unusual ZIP64 archives are not.
- Launch, rename, and delete imported projects.
- Export the library as a JSON backup and restore it later.
- Cache the PWA shell for offline reopening after the first successful load.

## Important limitations

This is a static front-end runner, not a general-purpose web server. It cannot run Python, Node, PHP, databases, or other backend services. Apps that depend on a local server, service workers, server-side routes, browser storage tied to their own origin, advanced module loading, or special cross-origin behavior may not work. Local HTML/CSS/JS and ordinary relative image/style/script assets are the intended use case. External network resources still need an internet connection.

Projects run in a sandboxed iframe. This is intentional: imported JavaScript is isolated from the library's own IndexedDB. The iframe is not granted the same-origin permission, so an imported app should not expect its own `localStorage` or IndexedDB to work. Use app-specific in-memory state or build persistence into a compatible single-page app if needed.

The browser may remove local site data if the user clears Safari website data, storage pressure occurs, or the PWA is removed. Export backups regularly. Keep backups somewhere safe; restoring a backup imports copies of the apps and can create duplicates.

## Publish from Windows (one-time setup)

1. Extract this project ZIP on the ThinkPad.
2. Create a GitHub repository, for example `local-app-host`.
3. Upload the files in this folder to the repository root (not the enclosing folder).
4. In GitHub, open **Settings → Pages**. Under Build and deployment, choose **Deploy from a branch**, select `main` and `/ (root)`, then Save.
5. Wait for GitHub Pages to publish the site. Open the HTTPS Pages address in Safari on the iPhone.
6. In Safari, use **Share → Add to Home Screen**. If offered, enable **Open as Web App**, then tap Add.
7. Open Local App Host from the Home Screen and import your HTML or ZIP projects from the Files app.

You only use Windows to publish the PWA shell. After it is published, the iPhone can be used for importing and running apps. Do not upload your own project ZIPs to GitHub Pages.

## Updating the host

If you later change the host source, upload the updated shell files to the same GitHub Pages repository. Reopen the PWA while online so the service worker can refresh its cached shell. Your imported project records are stored separately in IndexedDB and are not part of the site deployment.
