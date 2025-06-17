const net = require("net");

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");

// Uncomment this to pass the first stage
const server = net.createServer((socket) => {
  socket.on("data", (buffer) => {
    const request = buffer.toString();
    const [requestLine] = request.split("\r\n");
    const [method, path] = requestLine.split(" ");

    if (method === "GET" && path.startsWith("/echo/")) {
      const echoStr = decodeURIComponent(path.slice(6));
      const responseBody = JSON.stringify(echoStr);
      const contentLength = Buffer.byteLength(responseBody)
      console.log(responseBody)
      const response = [
        "HTTP/1.1 200 OK",
        "Content-Type: text/plain",
        `Content-Length: ${contentLength}`,
        "",
        responseBody,
      ].join("\r\n");

      socket.write(response);
    } else {
      const response = [
        "HTTP/1.1 404 Not Found",
        "Content-Type: text/plain",
        "Content-Length: 9",
        "",
        "Not Found",
      ].join("\r\n");

      socket.write(response);
    }

    socket.end();
  });
  socket.on("close", () => {
    
  });
});

server.listen(4221, "localhost");
