/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

// Use jsonc-parser.parse instead of JSON.parse, as JSONC can handle comments. VS Code uses jsonc-parser
// under the hood to provide symbols for JSON documents, so this will keep us consistent with VS code.
import { parse, ParseError, ParseErrorCode } from 'jsonc-parser'
import * as os from 'os'
import * as _path from 'path'
import * as vscode from 'vscode'
import * as fsUtils from '../../shared/filesystemUtilities'

export interface TemplatesConfig {
    templates: {
        [relativePath: string]: TemplateConfig | undefined
    }
}

export interface TemplateConfig {
    parameterOverrides?: {
        [key: string]: string | undefined
    },
    handlers?: {
        [handler: string]: HandlerConfig | undefined
    }
}

export interface HandlerConfig {
    event: {},
    environmentVariables: {
        [name: string]: string
    }
}

export function generateDefaultHandlerConfig(): HandlerConfig {
    return {
        event: {},
        environmentVariables: {}
    }
}

export interface LoadTemplatesConfigContext {
    fileExists(path: string): Thenable<boolean>
    readFile(path: string): Thenable<string>
    saveDocumentIfDirty(editorPath: string): Thenable<void>
}

export class DefaultLoadTemplatesConfigContext implements LoadTemplatesConfigContext {
    public readonly fileExists = fsUtils.fileExists
    public readonly readFile = fsUtils.readFileAsString

    public async saveDocumentIfDirty(editorPath: string): Promise<void> {
        const path = _path.normalize(vscode.Uri.file(editorPath).fsPath)
        const document = vscode.workspace.textDocuments.find(doc => {
            if (!doc.isDirty) {
                return false
            }

            if (_path.normalize(doc.uri.fsPath) !== path) {
                return false
            }

            return true
        })

        if (document) {
            await document.save()
        }
    }
}

export function getTemplatesConfigPath(workspaceFolderPath: string): string {
    return _path.join(
        workspaceFolderPath,
        '.aws',
        'templates.json'
    )
}

export async function load(
    workspaceFolderPath: string,
    context: LoadTemplatesConfigContext = new DefaultLoadTemplatesConfigContext()
): Promise<TemplatesConfig> {
    const templatesConfigPath = getTemplatesConfigPath(
        workspaceFolderPath,
    )

    return await loadTemplatesConfig(templatesConfigPath, context)
}

async function loadTemplatesConfig(
    path: string,
    context: LoadTemplatesConfigContext = new DefaultLoadTemplatesConfigContext()
): Promise<TemplatesConfig> {
    try {
        await context.saveDocumentIfDirty(path)

        if (!(await context.fileExists(path))) {
            return {
                templates: {}
            }
        }

        const raw = await context.readFile(path)
        const errors: ParseError[] = []
        const config = parse(raw, errors) as TemplatesConfig
        if (errors.length > 0) {
            const message = errors.length === 1 ?
                ` ${formatParseError(errors[0])}` :
                `${os.EOL}${errors.map(formatParseError).join(os.EOL)}`

            throw new Error(`Could not parse .aws/templates.json:${message}`)
        }

        return config
    } catch (err) {
        if (Array.isArray(err) && (err as any[]).length === 1) {
            err = (err as any[])[0]
        }

        throw new Error(`Could not load .aws/templates.json: ${err}`)
    }
}

function formatParseError(error: ParseError) {
    return `${getParseErrorDescription(error.error)} at offset ${error.offset}, length ${error.length}`
}

// Reverse enum mappings are only generated for non-const numerical enums,
// but ParseErrorCode is a const enum. So we have to reverse-map manually.
function getParseErrorDescription(code: ParseErrorCode): string {
    switch (code) {
        case ParseErrorCode.CloseBraceExpected:
            return 'close brace expected'
        case ParseErrorCode.CloseBracketExpected:
            return 'close bracket expected'
        case ParseErrorCode.ColonExpected:
            return 'colon expected'
        case ParseErrorCode.CommaExpected:
            return 'command expected'
        case ParseErrorCode.EndOfFileExpected:
            return 'end of file expected'
        case ParseErrorCode.InvalidCharacter:
            return 'invalid character'
        case ParseErrorCode.InvalidCommentToken:
            return 'invalid comment token'
        case ParseErrorCode.InvalidEscapeCharacter:
            return 'invalid escape character'
        case ParseErrorCode.InvalidNumberFormat:
            return 'invalid number format'
        case ParseErrorCode.InvalidSymbol:
            return 'invalid symbol'
        case ParseErrorCode.InvalidUnicode:
            return 'invalid unicode'
        case ParseErrorCode.PropertyNameExpected:
            return 'property name expected'
        case ParseErrorCode.UnexpectedEndOfComment:
            return 'unexpected end of comment'
        case ParseErrorCode.UnexpectedEndOfNumber:
            return 'unexpected end of number'
        case ParseErrorCode.UnexpectedEndOfString:
            return 'unexpected end of string'
        case ParseErrorCode.ValueExpected:
            return 'value expected'
        // By omitting the default case, we force the compiler to yell at us
        // if any enum members are added/removed/changed.
    }
}

export class TemplatesConfigPopulator {
    private isDirty: boolean = false

    public constructor(
        private config: TemplatesConfig,
    ) {
    }

    public ensureTemplateSectionExists(templateRelativePath: string): TemplatesConfigPopulator {
        this.ensureTemplatesSectionExists()

        if (!this.config.templates[templateRelativePath]) {
            this.config.templates[templateRelativePath] = {}
            this.isDirty = true
        }

        return this
    }

    public ensureTemplateHandlerSectionExists(
        templateRelativePath: string,
        handler: string
    ): TemplatesConfigPopulator {
        this.ensureTemplateHandlersSectionExists(templateRelativePath)

        if (!this.config.templates[templateRelativePath]!.handlers![handler]) {
            this.config.templates[templateRelativePath]!.handlers![handler] = {
                event: {},
                environmentVariables: {}
            }
            this.isDirty = true
        }

        return this
    }

    public ensureTemplateHandlerPropertiesExist(
        templateRelativePath: string,
        handler: string
    ): TemplatesConfigPopulator {
        this.ensureTemplateHandlerSectionExists(templateRelativePath, handler)

        const handlerConfig: HandlerConfig = this.config.templates[templateRelativePath]!.handlers![handler]!

        if (!handlerConfig.event) {
            handlerConfig.event = {}
            this.isDirty = true
        }

        if (!handlerConfig.environmentVariables) {
            handlerConfig.environmentVariables = {}
            this.isDirty = true
        }

        return this
    }

    public getResults(): {
        isDirty: boolean,
        templatesConfig: TemplatesConfig
    } {
        return {
            isDirty: this.isDirty,
            templatesConfig: this.config
        }
    }

    private ensureTemplatesSectionExists(): TemplatesConfigPopulator {
        if (!this.config) {
            this.config = {
                templates: {}
            }
            this.isDirty = true
        }

        if (!this.config.templates) {
            this.config.templates = {}
            this.isDirty = true
        }

        return this
    }

    private ensureTemplateHandlersSectionExists(templateRelativePath: string): TemplatesConfigPopulator {
        this.ensureTemplateSectionExists(templateRelativePath)

        if (!this.config.templates[templateRelativePath]!.handlers) {
            this.config.templates[templateRelativePath]!.handlers = {}
            this.isDirty = true
        }

        return this
    }
}
