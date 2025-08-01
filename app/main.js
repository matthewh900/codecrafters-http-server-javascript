const net = require("net");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const args = process.argv;
const dirIndex = args.indexOf("--directory");
let filesDirectory = ".";

if (dirIndex !== -1 && args[dirIndex + 1]) {
  filesDirectory = args[dirIndex + 1];
}

console.log("Logs from your program will appear here!");

const server = net.createServer((socket) => {
  let requestData = Buffer.alloc(0);

  socket.on("data", (chunk) => {
    requestData = Buffer.concat([requestData, chunk]);

    while (true) {
      const requestStr = requestData.toString();
      const headerEndIndex = requestStr.indexOf("\r\n\r\n");

      if (headerEndIndex === -1) {
        return; // wait for full headers
      }

      const headersPart = requestStr.slice(0, headerEndIndex);
      const bodyPart = requestData.slice(headerEndIndex + 4);

      const [requestLine, ...headerLines] = headersPart.split("\r\n");
      const [method, urlPath] = requestLine.split(" ");

      const headers = {};
      for (const line of headerLines) {
        const [key, ...rest] = line.split(":");
        if (key && rest.length > 0) {
          headers[key.trim().toLowerCase()] = rest.join(":").trim();
        }
      }

      const contentLength = headers["content-length"]
        ? parseInt(headers["content-length"], 10)
        : 0;

      if (bodyPart.length < contentLength) {
        return; // wait for full body
      }

      const fullRequestLength = headerEndIndex + 4 + contentLength;
      const body = bodyPart.slice(0, contentLength);

      const acceptEncoding = (headers["accept-encoding"] || "").toLowerCase();
      const connectionHeader = (headers["connection"] || "").toLowerCase();
      const shouldClose = connectionHeader === "close";

      const endSocketIfNeeded = () => {
        if (shouldClose) {
          socket.end();
        }
      };

      // Route: "/"
      if (urlPath === "/") {
        socket.write("HTTP/1.1 200 OK\r\n\r\n");
        endSocketIfNeeded();

      // Route: "/echo/{str}" — supports gzip
      } else if (method === "GET" && urlPath.startsWith("/echo/")) {
        const echoStr = decodeURIComponent(urlPath.slice(6));

        const sendGzipped = () => {
          zlib.gzip(echoStr, (err, compressed) => {
            if (err) {
              socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
              endSocketIfNeeded();
              return;
            }

            const headers = [
              "HTTP/1.1 200 OK",
              "Content-Type: text/plain",
              "Content-Encoding: gzip",
              `Content-Length: ${compressed.length}`,
            ];
            if (shouldClose) headers.push("Connection: close");
            headers.push("", "");

            socket.write(headers.join("\r\n"));
            socket.write(compressed);
            endSocketIfNeeded();
          });
        };

        const sendPlain = () => {
          const responseBody = echoStr;
          const buffer = Buffer.from(responseBody, "utf-8");
          const headers = [
            "HTTP/1.1 200 OK",
            "Content-Type: text/plain",
            `Content-Length: ${buffer.length}`,
          ];
          if (shouldClose) headers.push("Connection: close");
          headers.push("", responseBody);
          socket.write(headers.join("\r\n"));
          endSocketIfNeeded();
        };

        if (acceptEncoding.includes("gzip")) {
          sendGzipped();
        } else {
          sendPlain();
        }

      // Route: "/user-agent"
      } else if (method === "GET" && urlPath === "/user-agent") {
        const userAgent = headers["user-agent"] || "Unknown";
        const contentLength = Buffer.byteLength(userAgent);
        const responseHeaders = [
          "HTTP/1.1 200 OK",
          "Content-Type: text/plain",
          `Content-Length: ${contentLength}`,
        ];
        if (shouldClose) responseHeaders.push("Connection: close");
        responseHeaders.push("", userAgent);

        socket.write(responseHeaders.join("\r\n"));
        endSocketIfNeeded();

      // Route: "/files/{filename}" (GET)
      } else if (method === "GET" && urlPath.startsWith("/files/")) {
        const filename = decodeURIComponent(urlPath.slice("/files/".length));
        const filePath = path.join(filesDirectory, filename);
        const resolvedBase = path.resolve(filesDirectory);
        const resolvedFile = path.resolve(filePath);

        if (!resolvedFile.startsWith(resolvedBase)) {
          socket.write("HTTP/1.1 403 Forbidden\r\n\r\nForbidden");
          endSocketIfNeeded();
          return;
        }

        fs.readFile(resolvedFile, (err, data) => {
          if (err) {
            socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
          } else {
            const headers = [
              "HTTP/1.1 200 OK",
              "Content-Type: application/octet-stream",
              `Content-Length: ${data.length}`,
            ];
            if (shouldClose) headers.push("Connection: close");
            headers.push("", "");

            socket.write(headers.join("\r\n"));
            socket.write(data);
          }
          endSocketIfNeeded();
        });

      // Route: "/files/{filename}" (POST)
      } else if (method === "POST" && urlPath.startsWith("/files/")) {
        const filename = decodeURIComponent(urlPath.slice("/files/".length));
        const filePath = path.join(filesDirectory, filename);
        const resolvedBase = path.resolve(filesDirectory);
        const resolvedFile = path.resolve(filePath);

        if (!resolvedFile.startsWith(resolvedBase)) {
          socket.write("HTTP/1.1 403 Forbidden\r\n\r\nForbidden");
          endSocketIfNeeded();
          return;
        }

        fs.writeFile(resolvedFile, body, (err) => {
          if (err) {
            socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
          } else {
            socket.write("HTTP/1.1 201 Created\r\n\r\n");
          }
          endSocketIfNeeded();
        });

      // Fallback: Not found
      } else {
        const body = "Not Found";
        const headers = [
          "HTTP/1.1 404 Not Found",
          "Content-Type: text/plain",
          `Content-Length: ${Buffer.byteLength(body)}`,
        ];
        if (shouldClose) headers.push("Connection: close");
        headers.push("", body);

        socket.write(headers.join("\r\n"));
        endSocketIfNeeded();
      }

      // Remove this request from the buffer
      requestData = requestData.slice(fullRequestLength);

      // If no more data, stop processing
      if (requestData.length === 0) {
        return;
      }
    }
  });

  socket.on("close", () => {});
});

server.listen(4221, "localhost");
