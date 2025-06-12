const net = require("net");

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");

// Uncomment this to pass the first stage
const server = net.createServer((socket) => {
  socket.on('data', (data) => {
    const request = data.toString()
    const requestLine = request.split('\r\n')[0]
    const [method, path, version] = requestLine.split(' ')
    if (path === '/'){
        socket.write("HTTP/1.1 200 OK\r\n\r\n");
    } else {
        socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    }
  })
  socket.on("close", () => {
    socket.end();
  });
});

server.listen(4221, "localhost");
