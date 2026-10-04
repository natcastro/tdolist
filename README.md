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

## Guardar en la nube (Supabase, gratis)

Por defecto los datos viven solo en el navegador. Para verlos igual desde compu, tablet y celular:

1. Crea un proyecto gratis en [supabase.com](https://supabase.com).
2. En **SQL Editor**, pega y corre el contenido de `supabase/setup.sql`.
3. En **Authentication > Users > Add user**, crea un usuario con un email tuyo y la contraseña de acceso (marca "Auto Confirm User"). En **Authentication > Providers > Email** desactiva "Allow new users to sign up".
4. En **Project Settings > API** copia el *Project URL* y la clave *anon public*.
5. En `index.html`, rellena `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_EMAIL` (el email del paso 3).

Con eso, la pantalla de acceso inicia sesión en Supabase con esa contraseña y los datos se sincronizan. La clave *anon* es pública por diseño; lo que protege tus datos son las políticas de acceso de `setup.sql`.

## Pestaña To Do (planificador semanal)

Arriba hay dos pestañas: **Checklist** (tareas, metas y hábitos) y **To Do** (lo que vas a hacer en la semana).

- Elige un día en la fila de la semana (o cambia de semana con las flechas) y planea su día en **Mañana / Tarde / Noche**.
- El panel **Pendientes** (izquierda, plegable) lista tus tareas pendientes: tócalas para agregarlas al día que estás viendo (tócalas otra vez para quitarlas) o arrástralas.
- Escribe cualquier cosa a mano en cada bloque ("levantarme", "gym").
- Arrastra con el agarrador de la izquierda de cada ítem: para reordenar, pasarlo a otro bloque ("más tarde") o soltarlo sobre otro día de la fila de arriba. El menú de tres puntos también tiene "Mover a otro día…".
- Marcar una tarea del Checklist desde el To Do también la marca como completada allá.
- Los pendientes sin terminar de días anteriores aparecen con un aviso para pasarlos a hoy.

Los datos del To Do se guardan junto a los hábitos (en este navegador y, si activaste Supabase, en la nube), así que no hace falta cambiar la base de datos.

## Asistente de IA (Groq, plan gratis)

El botón **Asistente** (abajo a la derecha) te deja decir o escribir lo que tienes que hacer ("el quiz de IS 531 ahora es el viernes", "agrega el memo 5 de IS 590R para el 3 de noviembre"). La IA propone los cambios, tú los confirmas o corriges, y recién ahí se aplican (con botón de deshacer).

La clave de la IA **nunca va en la página**: vive como secreto en una función de Supabase (`supabase/functions/assistant/index.ts`) que solo atiende a tu sesión iniciada.

Para activarlo (una sola vez):

1. Crea una cuenta gratis en [console.groq.com](https://console.groq.com) (no pide tarjeta) y, en **API Keys**, crea una clave.
2. En Supabase: **Edge Functions > Secrets**, agrega `GROQ_API_KEY` con esa clave. Opcional: `GROQ_MODEL` para forzar un modelo (por defecto prueba `openai/gpt-oss-120b`, luego `qwen/qwen3.8-27b` y `openai/gpt-oss-20b`).
3. En **Edge Functions**, abre tu función, pestaña **Code**, pega el contenido de `supabase/functions/assistant/index.ts` y dale a **Deploy updates**. Deja activado "Verify JWT" (o desactívalo si da error 401; la función valida tu sesión por su cuenta).
4. Recarga la página, inicia sesión y toca **Asistente**.

Límites del plan gratis (aproximados, revísalos en tu consola de Groq): ~1,000 consultas al día, ~8,000 tokens por minuto. Por eso la página solo envía las tareas relevantes en cada consulta.

También maneja tu **To Do**: *"agrega gym a mi to do de hoy en la mañana"*, *"pon el quiz de IS 531 en mi to do del jueves"*, *"pasa levantarme para la tarde"*, *"marca gym como hecho"*. Igual que con las tareas, primero ves la propuesta y tú confirmas. Después de cambiar la función en Supabase (o actualizar `supabase/functions/assistant/index.ts`), vuelve a pegarla en Edge Functions > tu función > Code > Deploy updates.

El micrófono usa el reconocimiento de voz del navegador (mejor en Chrome y Safari). Si tu navegador no lo soporta, el botón de micrófono no aparece y puedes escribir o usar el micrófono del teclado del celular.

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
