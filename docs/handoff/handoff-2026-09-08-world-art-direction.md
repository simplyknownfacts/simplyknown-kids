# World artwork correction - 2026-09-08 (codex)

## Resume here
1. Scott rejected the current 3D village artwork: Watch does not read as a movie theater, Listen has no clear audio identity, Learn is unclear, and Art looks crude. Treat the current huts as unapproved placeholders. Real WebGL geometry and passing interaction tests do not establish acceptable artwork.
2. Scott asked whether Codex can animate or needs an outside service, and offered existing AI subscriptions. Codex can implement 3D scene animation/interactions; the next improvement needs better designed models and materials. An asynchronous question asks which services Scott already has. No provider has been selected, connected, charged or used to generate a model yet.
3. Proposed next step is one recognizable animated movie theater in the local scene for Scott to inspect before replacing every building. Provider choice and the pilot itself remain pending. Do not generate another flat backdrop and represent it as the requested interactive 3D world.
4. Current application remains9350c04, with parent settings handoff97c77fd. Local preview is http://localhost:8795/home.html . All previous parent/game fixes and Scott's production promote gate remain; no production, schedule or Video action.

## Proposed artwork acceptance
1. Watch: a cinema facade with an unmistakable marquee canopy, ticket booth, poster frames and broad entrance. Slow marquee light movement and a curtain/door response make the building feel alive; the full building opens Watch.
2. Listen: a music/audio building with a large headphone or speaker silhouette and visible player details. Use gentle speaker movement or musical notes.
3. Learn: recognizable book/school/discovery imagery with a clear main shape; avoid relying on an obscured small telescope. A page turn or moving learning prop supplies meaningful motion.
4. Art: a deliberate studio design with a substantial palette, brush and easel; coherent materials and clean proportions. A small painting motion or color change supplies activity identity.
5. Games: an arcade/playhouse silhouette with visible game equipment. All five buildings should remain distinguishable at phone size with their labels hidden; retain short labels integrated into the architecture.
6. Asset requirements: actual GLB/glTF geometry, locally bundled textures, clear ownership/license record, separate parts/pivots for animated props, original designs, and measured phone performance. Preserve whole-building taps, center companion, reduced motion and offline use. Quality must be judged in the real local scene, not solely from a provider thumbnail.

## Investigation and limits
1. The current hut implementation uses shared procedural primitives in js/world-huts.js. Its animation update loop is real; current source is not evidence that the art meets Scott's quality target.
2. Available tool discovery found no connected dedicated 3D model generator. Plugin-management guidance was consulted; plugin search/suggestion tools are not exposed in this task. No plugin installation or account access was attempted.
3. Primary-source capability check: [Meshy Image to 3D](https://docs.meshy.ai/en/api/image-to-3d) offers textured model export including GLB; [Tripo generation](https://platform.tripo3d.ai/docs/generation) documents text/image model generation and optional editable parts. These support a possible asset workflow; no price, subscription entitlement or output-quality guarantee was established.
4. The previous black-arrow report remains unresolved: no separate arrow was reproduced in the DOM or sampled orca base/talking/random-action frames. The visible upper-left triangle is an attached fin. A clarification question about fin versus separate pointer is pending; no animal artwork was changed.
