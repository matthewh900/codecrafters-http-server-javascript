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

    // Handle multiple requests per connection
    while (true) {
      const requestStr = requestData.toString();
      const headerEndIndex = requestStr.indexOf("\r\n\r\n");

      if (headerEndIndex === -1) {
        // Headers not fully received yet, wait for more data
        return;
      }

      // Parse headers and body
      const headersPart = requestStr.slice(0, headerEndIndex);
      const bodyPart = requestData.slice(headerEndIndex + 4);

      const [requestLine, ...headerLines] = headersPart.split("\r\n");
      const [method, urlPath] = requestLine.split(" ");

      // Parse headers into a dictionary (lowercase keys)
      const headers = {};
      for (const line of headerLines) {
        const [key, ...rest] = line.split(":");
        if (key && rest.length > 0) {
          headers[key.trim().toLowerCase()] = rest.join(":").trim();
        }
      }

      // Determine content length and if full body is received
      const contentLength = headers["content-length"]
        ? parseInt(headers["content-length"], 10)
        : 0;

      if (bodyPart.length < contentLength) {
        // Wait for full body
        return;
      }

      const fullRequestLength = headerEndIndex + 4 + contentLength;
      const body = bodyPart.slice(0, contentLength);

      // Check for Accept-Encoding and Connection headers
      const acceptEncoding = (headers["accept-encoding"] || "").toLowerCase();
      const connectionHeader = (headers["connection"] || "").toLowerCase();
      const shouldClose = connectionHeader === "close";

      // Helper function to end socket if needed
      const endSocketIfNeeded = () => {
        if (shouldClose) {
          socket.end();
        }
      };

      // Routing logic

      if (urlPath === "/") {
        // Root path: simple 200 OK with no body
        let responseHeaders = [
          "HTTP/1.1 200 OK",
          "",
          ""
        ];
        if (shouldClose) responseHeaders.splice(1, 0, "Connection: close");

        socket.write(responseHeaders.join("\r\n"));
        endSocketIfNeeded();

      } else if (method === "GET" && urlPath.startsWith("/echo/")) {
        const echoStr = decodeURIComponent(urlPath.slice(6));

        if (acceptEncoding.includes("gzip")) {
          // Respond with gzip compressed body
          zlib.gzip(echoStr, (err, compressed) => {
            if (err) {
              socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
              endSocketIfNeeded();
              return;
            }

            const responseHeaders = [
              "HTTP/1.1 200 OK",
              "Content-Type: text/plain",
              "Content-Encoding: gzip",
              `Content-Length: ${compressed.length}`,
            ];
            if (shouldClose) responseHeaders.push("Connection: close");
            responseHeaders.push("", "");

            socket.write(responseHeaders.join("\r\n"));
            socket.write(compressed);
            endSocketIfNeeded();
          });
        } else {
          // Respond with plain text body
          const buffer = Buffer.from(echoStr, "utf-8");
          const responseHeaders = [
            "HTTP/1.1 200 OK",
            "Content-Type: text/plain",
            `Content-Length: ${buffer.length}`,
          ];
          if (shouldClose) responseHeaders.push("Connection: close");
          responseHeaders.push("", echoStr);

          socket.write(responseHeaders.join("\r\n"));
          endSocketIfNeeded();
        }

      } else if (method === "GET" && urlPath === "/user-agent") {
        // Return User-Agent header value or "Unknown"
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

      } else if (method === "GET" && urlPath.startsWith("/files/")) {
        // Serve file from specified directory
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
            const responseHeaders = [
              "HTTP/1.1 200 OK",
              "Content-Type: application/octet-stream",
              `Content-Length: ${data.length}`,
            ];
            if (shouldClose) responseHeaders.push("Connection: close");
            responseHeaders.push("", "");

            socket.write(responseHeaders.join("\r\n"));
            socket.write(data);
          }
          endSocketIfNeeded();
        });

      } else if (method === "POST" && urlPath.startsWith("/files/")) {
        // Save body to file
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

      } else {
        // Fallback: 404 Not Found
        const body = "Not Found";
        const responseHeaders = [
          "HTTP/1.1 404 Not Found",
          "Content-Type: text/plain",
          `Content-Length: ${Buffer.byteLength(body)}`,
        ];
        if (shouldClose) responseHeaders.push("Connection: close");
        responseHeaders.push("", body);

        socket.write(responseHeaders.join("\r\n"));
        endSocketIfNeeded();
      }

      // Remove processed request from buffer and continue to check if more requests are pending
      requestData = requestData.slice(fullRequestLength);

      // Stop processing if no more data to parse
      if (requestData.length === 0) {
        return;
      }
    }
  });

  socket.on("close", () => {
    // Connection closed by client or server
  });
});

server.listen(4221, "localhost");
