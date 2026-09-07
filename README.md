# Checklist académico

Dashboard de tareas y metas del semestre. Es un solo archivo HTML (`index.html`), no necesita instalación de nada especial para funcionar, solo un servidor local para que se comporte como una página web de verdad (los datos guardados no funcionan bien si abres el archivo directamente con doble click, por eso el servidor).

## Primera vez

Necesitas tener [Node.js](https://nodejs.org) instalado (para usar `npx`). Si ya lo tienes, solo:

```bash
cd checklist-academico
npx live-server
```

Esto abre automáticamente `http://127.0.0.1:8080` en tu navegador. `live-server` se queda corriendo y vigilando la carpeta: cada vez que `index.html` cambie, la página se refresca sola, sin que tengas que hacer nada.

Déjalo corriendo en una terminal aparte mientras trabajas. Para pararlo, `Ctrl + C`.

## Cómo se actualiza

Cada vez que le pida a Claude un cambio al checklist, Claude te va a dar un `index.html` nuevo. Solo reemplaza el archivo en esta carpeta (mismo nombre, `index.html`) y guarda. Si tienes `live-server` corriendo, el navegador se refresca solo. Tus tareas marcadas y las que agregues no se pierden: se guardan en el almacenamiento del navegador, no dentro del archivo.

## Respaldo con git (opcional)

Esta carpeta ya es un repositorio git local (`git log` para ver el historial). Si quieres respaldarlo en GitHub:

```bash
git remote add origin <url-de-tu-repo-vacio-en-github>
git branch -M main
git push -u origin main
```

Después de eso, cada vez que reemplaces `index.html` con una versión nueva:

```bash
git add -A
git commit -m "actualización del checklist"
git push
```
