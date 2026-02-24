module.exports = {
    apps: [
        {
            name: "cyberspace99",
            script: "./server/server.js",
            env: {
                NODE_ENV: "production",
                PORT: 3000
            }
        }
    ]
};
