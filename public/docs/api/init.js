window.onload = function () {
  window.ui = SwaggerUIBundle({
    url: "/docs/api/openapi.yaml",
    dom_id: "#swagger-ui",
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    layout: "StandaloneLayout",
    deepLinking: true,
    // "Try it out" faz a chamada do navegador: só funciona de uma origem liberada no servidor (CORS restrito).
    // Para testar sem isso, use curl (exemplos em /docs/mcp e docs/API-MCP.md).
  });
};
