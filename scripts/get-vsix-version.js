const fs = require('fs')

try {
    const log = fs.readFileSync('vsix.log', 'utf8')
    const match = log.match(/VSIX Version: (.+)/)
    if (match) {
        console.log(match[1])
    } else {
        process.exit(1)
    }
} catch (error) {
    process.exit(1)
}
