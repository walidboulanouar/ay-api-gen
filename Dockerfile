# ay-api-gen — Runtime MCP Server Container
#
# Build:
#   docker build -t ay-api-gen .
#
# Run (pass any OpenAPI spec URL):
#   docker run -i ay-api-gen https://petstore.swagger.io/v2/swagger.json
#
# With auth:
#   docker run -i -e API_KEY=sk-... ay-api-gen https://api.example.com/openapi.json

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production

FROM node:22-slim
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY src/ ./src/
COPY bin/ ./bin/
COPY package.json ./

ENTRYPOINT ["node", "src/runtime/mcp-server.js"]
