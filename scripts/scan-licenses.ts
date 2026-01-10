#!/usr/bin/env node

import { execSync } from 'child_process'
import { existsSync, rmSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'

function banner() {
    console.log('*****************************************')
    console.log('**     AWS Toolkit License Scanner     **')
    console.log('*****************************************')
    console.log('')
}

function genAttribution() {
    console.log('')
    console.log(' == Generating Attribution Document ==')

    try {
        execSync('npm install -g oss-attribution-generator', { stdio: 'inherit' })
        execSync('generate-attribution', { stdio: 'inherit' })

        if (existsSync('oss-attribution')) {
            renameSync(join('oss-attribution', 'attribution.txt'), 'LICENSE-THIRD-PARTY')
            rmSync('oss-attribution', { recursive: true, force: true })
            console.log('Attribution document generated: LICENSE-THIRD-PARTY')
        } else {
            console.log('Warning: oss-attribution directory not found')
        }
    } catch (error) {
        console.error('Error generating attribution:', error)
    }
}

function genFullLicenseReport() {
    console.log('')
    console.log(' == Generating Full License Report ==')

    try {
        execSync('npm install -g license-checker', { stdio: 'inherit' })
        const licenseData = execSync('license-checker --json', { encoding: 'utf8' })
        writeFileSync('licenses-full.json', licenseData)
        console.log('Full license report generated: licenses-full.json')
    } catch (error) {
        console.error('Error generating license report:', error)
    }
}

function main() {
    banner()

    if (!existsSync('package.json')) {
        console.error('Error: package.json not found. Please run this script from the project root.')
        process.exit(1)
    }

    if (!existsSync('node_modules')) {
        console.log('node_modules not found. Running npm install...')
        try {
            execSync('npm install', { stdio: 'inherit' })
        } catch (error) {
            console.error('Error running npm install:', error)
            process.exit(1)
        }
    }

    console.log('Scanning licenses for AWS Toolkit VS Code project...')
    console.log(`Project root: ${process.cwd()}`)
    console.log('')

    genAttribution()
    genFullLicenseReport()

    console.log('')
    console.log('=== License Scan Complete ===')
    console.log('Generated files:')
    console.log('  - LICENSE-THIRD-PARTY (attribution document)')
    console.log('  - licenses-full.json (complete license data)')
    console.log('')
}

if (require.main === module) {
    main()
}
