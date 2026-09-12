---
name: html-brief
description: Deliver a complete long explanation in one fixed dark HTML template when the established answer format requires it.
---

# HTML Brief

Use this skill when a complete long explanation needs several detailed sections. Keep short answers in chat. Honor an explicit user format or path, including JSON, code, a letter, a long inline answer, or a prohibition on files. Do not duplicate an already requested suitable artifact. A request to explain in detail without another format uses HTML for a long answer.

Read [the template](assets/report.html). Fill `{{TITLE}}`, `{{SUMMARY}}`, and `{{BLOCKS}}`, repeating the supplied native details/summary block with one question per block. Use as many blocks as the content needs. Escape inserted text as HTML; preserve required conditions, numbers, sources, and material limitations. Long lines wrap and wide tables/code remain readable within their block.

Keep the template's dark CSS and native markup. Change content only; do not redesign it or add JavaScript, mobile layouts, media queries, animation, external libraries, a renderer, or a JSON schema. A template redesign requires a separate request.

Create one HTML answer in the established results directory, otherwise in the current task's outputs directory. An explicit user path wins. Do not overwrite an unrelated same-name file. Provide the result, any material limitation or required question, and a direct file link in chat; use the existing viewer to show the file when available.

If the file cannot be created or delivered, state the limitation and give the available short result. If required content cannot be delivered without changing format, ask only the necessary format question. Do not claim the incomplete result is complete or install tools or a server to bypass the limitation. Verification follows the main prompt's ordinary reading-and-logic rule and explicit-evidence boundary.

The presentation idea draws on [Visual Explainer](https://github.com/nicobailon/visual-explainer). This minimal template uses the user's approved local design. Preserve applicable copyright and MIT notices if source text or code is copied from that project.
