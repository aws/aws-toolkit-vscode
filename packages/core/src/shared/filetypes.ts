/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import * as constants from '../shared/constants'
import * as aslFormats from '../stepFunctions/constants/aslFormats'
import * as fsutil from '../shared/filesystemUtilities'
import fs from '../shared/fs/fs'
import globals from './extensionGlobals'
import { telemetry, FileEditAwsFile, IdeEditCodeFile } from './telemetry/telemetry'
import { AwsFiletype } from './telemetry/telemetry'
import * as CloudFormation from './cloudformation/cloudformation'

/** AWS filetypes: vscode language ids */
export const awsFiletypeLangIds = {
    /** vscode language ids registered by AWS Toolkit or other AWS extensions for handling. */
    awsOwned: [aslFormats.JSON_ASL, aslFormats.YAML_ASL, constants.ssmJson, constants.ssmYaml],
    /** generic vscode language ids that possibly are AWS filetypes  */
    ambiguous: ['ini', 'plaintext', aslFormats.JSON_TYPE, aslFormats.YAML_TYPE],
}

/**
 * Maps vscode language ids to AWS filetypes for telemetry.
 */
export function langidToAwsFiletype(langId: string): AwsFiletype {
    switch (langId) {
        case constants.ssmJson:
        case constants.ssmYaml:
            return 'ssmDocument'
        case aslFormats.JSON_ASL:
        case aslFormats.YAML_ASL:
            return 'stepfunctionsAsl'
        default:
            return 'other'
    }
}

/** Returns true if file `f` is somewhere in `~/.aws`. */
export function isAwsConfig(f: string): boolean {
    const awsDir = path.join(fs.getUserHomeDir(), '.aws')
    if (fsutil.isInDirectory(awsDir, f)) {
        return true
    }
    return false
}

export function isAwsFiletype(doc: vscode.TextDocument): boolean | undefined {
    if (awsFiletypeLangIds.awsOwned.includes(doc.languageId)) {
        return true
    }
    if (isAwsConfig(doc.fileName)) {
        return true
    }
    if (awsFiletypeLangIds.ambiguous.includes(doc.languageId)) {
        return undefined // Maybe
    }
    return false
}

export function activate(): void {
    globals.context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(async (editor) => {
            const doc = editor?.document
            // Ignore output:// files.
            // Ignore *.git files (from the builtin git extension).
            // Ignore ~/.vscode/argv.json (vscode internal file).
            const isNoise =
                !doc || doc.uri.scheme === 'git' || doc.uri.scheme === 'output' || doc.fileName.endsWith('argv.json')
            if (isNoise) {
                return
            }

            const basename = path.basename(doc.fileName)
            let fileExt: string | undefined = path.extname(doc.fileName).trim()
            fileExt = fileExt !== '' ? fileExt : undefined // Telemetry client will fail on empty string.

            if (isCodeFile(basename)) {
                const metric: IdeEditCodeFile = {
                    filenameExt: fileExt,
                    result: 'Succeeded',
                    passive: true, // IDE usage != extension usage.
                }
                const isSameMetricPending = await globals.telemetry.findPendingMetric('ide_editCodeFile', metric, [
                    'filenameExt',
                ])
                if (!isSameMetricPending) {
                    // Avoid redundant/duplicate metrics.
                    telemetry.ide_editCodeFile.emit(metric)
                }
            }

            const isAwsFileExt = isAwsFiletype(doc)
            const isSchemaHandled = globals.schemaService.isMapped(doc.uri)
            const cfnTemplate = CloudFormation.isValidFilename(doc.uri)
                ? await CloudFormation.tryLoad(doc.uri)
                : undefined
            const isCfnTemplate = cfnTemplate?.template !== undefined

            if (!isAwsFileExt && !isSchemaHandled && !isCfnTemplate) {
                return
            }

            // TODO: ask schemaService for the precise filetype.
            let telemKind = isAwsConfig(doc.fileName) ? 'awsCredentials' : langidToAwsFiletype(doc.languageId)
            if (isCfnTemplate) {
                telemKind = cfnTemplate.kind === 'sam' ? 'cloudformationSam' : 'cloudformation'
            } else if (telemKind === 'other') {
                telemKind = isSchemaHandled ? 'cloudformation' : 'other'
            }

            // HACK: for "~/.aws/foo" vscode sometimes _only_ emits "~/.aws/foo.git".
            if (telemKind === 'awsCredentials' && fileExt === '.git') {
                fileExt = undefined
            }

            // Ensure nice syntax highlighting for ~/.aws/ files.
            if (
                telemKind === 'awsCredentials' &&
                doc.languageId !== 'ini' &&
                (basename === 'credentials' || basename === 'config')
            ) {
                await vscode.languages.setTextDocumentLanguage(doc, 'ini')
            }

            const metric: FileEditAwsFile = {
                awsFiletype: telemKind,
                passive: true,
                result: 'Succeeded',
                filenameExt: fileExt,
            }
            const isSameMetricPending = await globals.telemetry.findPendingMetric('file_editAwsFile', metric, [
                'awsFiletype',
                'filenameExt',
            ])
            if (isSameMetricPending) {
                return // Avoid redundant/duplicate metrics.
            }

            telemetry.file_editAwsFile.emit(metric)
        }, undefined)
    )
}

/**
 * Most common programming langauges and their file extensions
 * Includes list from https://survey.stackoverflow.co/2023/#technology plus extra items.
 */
export const codefileExtensions = new Set([
    '.abap',
    '.ada',
    '.adb',
    '.ads',
    '.apl',
    '.asm',
    '.awk',
    '.b',
    '.bas',
    '.bash',
    '.bat',
    '.boo',
    '.bms',
    '.c',
    '.cbl',
    '.cc',
    '.cfc',
    '.cfm',
    '.cjs',
    '.clj',
    '.cljc',
    '.cljs',
    '.cls',
    '.cmake',
    '.cob',
    '.cobra',
    '.coffee',
    '.cpp',
    '.cpy',
    '.cr',
    '.cs',
    '.css',
    '.csx',
    '.cxx',
    '.d',
    '.dart',
    '.dfm',
    '.dockerfile',
    '.dpr',
    '.e',
    '.el',
    '.elm',
    '.erl',
    '.ex',
    '.exs',
    '.f',
    '.f03',
    '.f08',
    '.f77',
    '.f90',
    '.f95',
    '.flow',
    '.for',
    '.fs',
    '.fsi',
    '.fsx',
    '.gd',
    '.go',
    '.gql',
    '.gradle',
    '.graphql',
    '.groovy',
    '.gs',
    '.gsp',
    '.gst',
    '.gsx',
    '.gvy',
    '.h',
    '.hack',
    '.hh',
    '.hpp',
    '.hrl',
    '.hs',
    '.htm',
    '.html',
    '.hy',
    '.idl',
    '.io',
    '.jar',
    '.java',
    '.jl',
    '.js',
    '.json',
    '.jsx',
    '.kt',
    '.kts',
    '.lean',
    '.lgt',
    '.lhs',
    '.lisp',
    '.logtalk',
    '.lsp',
    '.lua',
    '.m',
    '.ma',
    '.mak',
    '.makefile',
    '.md',
    '.mjs',
    '.ml',
    '.mli',
    '.mpl',
    '.ms',
    '.mu',
    '.mv',
    '.n',
    '.nb',
    '.nim',
    '.nix',
    '.oot',
    '.oz',
    '.pas',
    '.pasm',
    '.perl',
    '.php',
    '.phtml',
    '.pike',
    '.pir',
    '.pl',
    '.pli',
    '.pm',
    '.pmod',
    '.pp',
    '.pro',
    '.prolog',
    '.ps1',
    '.psd1',
    '.psm1',
    '.purs',
    '.py',
    '.pyw',
    '.qs',
    '.r',
    '.raku',
    '.rakumod',
    '.rakutest',
    '.rb',
    '.rbw',
    '.rdata',
    '.re',
    '.red',
    '.reds',
    '.res',
    '.rex',
    '.rexx',
    '.ring',
    '.rkt',
    '.rktl',
    '.rlib',
    '.rm',
    '.rmd',
    '.roff',
    '.ron',
    '.rs',
    '.ruby',
    '.s',
    '.sas',
    '.sb',
    '.sb2',
    '.sb3',
    '.sc',
    '.scala',
    '.scd',
    '.scm',
    '.scss',
    '.sass',
    '.sh',
    '.shen',
    '.sig',
    '.sml',
    '.sol',
    '.sql',
    '.ss',
    '.st',
    '.sv',
    '.swift',
    '.t',
    '.tcl',
    '.tf',
    '.trigger',
    '.ts',
    '.tsx',
    '.tu',
    '.v',
    '.vala',
    '.vapi',
    '.vb',
    '.vba',
    '.vbx',
    '.vhd',
    '.vhdl',
    '.vue',
    '.x',
    '.xc',
    '.xi',
    '.xml',
    '.yaml',
    '.yml',
    '.zig',
])

// Code file names without an extension
export const codefileNames = new Set(['Dockerfile', 'Dockerfile.build'])

/** Returns true if `filename` is a code file. */
export function isCodeFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase()
    return codefileExtensions.has(ext) || codefileNames.has(path.basename(filename))
}
