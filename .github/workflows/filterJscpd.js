const fs = require('fs/promises')

async function main() {
    const jscpdReportPath = process.argv[2]
    const diffPath = process.argv[3]
    console.log('Recieved jscpd path: %s', jscpdReportPath)
    console.log('Recieved diff path: %s', diffPath)

    const jscpdReport = JSON.parse(await fs.readFile(jscpdReportPath, 'utf8'))
}

void main()
