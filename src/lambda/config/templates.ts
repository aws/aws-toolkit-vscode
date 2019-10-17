/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Use jsonc-parser.parse instead of JSON.parse, as JSONC can handle comments. VS Code uses jsonc-parser
// under the hood to provide symbols for JSON documents, so this will keep us consistent with VS code.
import * as jsonParser from 'jsonc-parser'
import * as os from 'os'
import * as _path from 'path'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { access, mkdir, writeFile } from '../../shared/filesystem'
import * as fsUtils from '../../shared/filesystemUtilities'
import { getLogger, Logger } from '../../shared/logger'
import { getTabSizeSetting } from '../../shared/utilities/editorUtilities'
import { saveDocumentIfDirty } from '../../shared/utilities/textDocumentUtilities'

const localize = nls.loadMessageBundle()

export interface TemplatesConfig {
    templates: {
        [relativePath: string]: TemplateConfig | undefined
    }
}

export interface TemplateConfig {
    parameterOverrides?: {
        [key: string]: string | undefined
    }
    handlers?: {
        [handler: string]: HandlerConfig | undefined
    }
}

export interface HandlerConfig {
    event: {}
    environmentVariables: {
        [name: string]: string
    }
    dockerNetwork?: string
}

export function generateDefaultHandlerConfig(): HandlerConfig {
    return {
        event: {},
        environmentVariables: {},
        dockerNetwork: undefined
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

    public readonly saveDocumentIfDirty = saveDocumentIfDirty
}

export function getTemplatesConfigPath(workspaceFolderPath: string): string {
    return _path.join(workspaceFolderPath, '.aws', 'templates.json')
}

export async function load(
    workspaceFolderPath: string,
    context: LoadTemplatesConfigContext = new DefaultLoadTemplatesConfigContext()
): Promise<TemplatesConfig> {
    const templatesConfigPath = getTemplatesConfigPath(workspaceFolderPath)

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

        return loadTemplatesConfigFromJson(raw)
    } catch (err) {
        if (Array.isArray(err) && (err as any[]).length === 1) {
            err = (err as any[])[0]
        }

        throw new Error(`Could not load .aws/templates.json: ${err}`)
    }
}

export function loadTemplatesConfigFromJson(json: string): TemplatesConfig {
    const errors: jsonParser.ParseError[] = []
    const config = jsonParser.parse(json, errors) as TemplatesConfig
    if (errors.length > 0) {
        const message =
            errors.length === 1
                ? ` ${formatParseError(errors[0])}`
                : `${os.EOL}${errors.map(formatParseError).join(os.EOL)}`

        throw new Error(`Could not parse .aws/templates.json:${message}`)
    }

    return config
}

export function showTemplatesConfigurationError(
    error: TemplatesConfigFieldTypeError,
    showErrorMessage: typeof vscode.window.showErrorMessage = vscode.window.showErrorMessage
) {
    const logger: Logger = getLogger()

    showErrorMessage(
        localize(
            'AWS.lambda.configure.error.fieldtype',
            // tslint:disable-next-line:max-line-length
            'Your templates.json file has an issue. {0} was detected as {1} instead of one of the following: [{2}]. Please change or remove this field, and try again.',
            error.jsonPath.join('.'),
            error.actualType,
            error.expectedTypes.join(', ')
        )
    )

    // tslint:disable-next-line:max-line-length
    logger.error(
        `Error detected in templates.json: ${error.message}. Field: ${error.jsonPath.join(
            '.'
        )}, expected one of: [${error.expectedTypes.join(', ')}], was: ${error.actualType}`
    )
}

export async function ensureTemplatesConfigFileExists(path: string): Promise<void> {
    try {
        await access(_path.dirname(path))
    } catch {
        await mkdir(_path.dirname(path), { recursive: true })
    }

    try {
        await access(path)
    } catch {
        await writeFile(path, '{}')
    }
}

function formatParseError(error: jsonParser.ParseError) {
    return `${getParseErrorDescription(error.error)} at offset ${error.offset}, length ${error.length}`
}

// Reverse enum mappings are only generated for non-const numerical enums,
// but ParseErrorCode is a const enum. So we have to reverse-map manually.
function getParseErrorDescription(code: jsonParser.ParseErrorCode): string {
    switch (code) {
        case jsonParser.ParseErrorCode.CloseBraceExpected:
            return 'close brace expected'
        case jsonParser.ParseErrorCode.CloseBracketExpected:
            return 'close bracket expected'
        case jsonParser.ParseErrorCode.ColonExpected:
            return 'colon expected'
        case jsonParser.ParseErrorCode.CommaExpected:
            return 'command expected'
        case jsonParser.ParseErrorCode.EndOfFileExpected:
            return 'end of file expected'
        case jsonParser.ParseErrorCode.InvalidCharacter:
            return 'invalid character'
        case jsonParser.ParseErrorCode.InvalidCommentToken:
            return 'invalid comment token'
        case jsonParser.ParseErrorCode.InvalidEscapeCharacter:
            return 'invalid escape character'
        case jsonParser.ParseErrorCode.InvalidNumberFormat:
            return 'invalid number format'
        case jsonParser.ParseErrorCode.InvalidSymbol:
            return 'invalid symbol'
        case jsonParser.ParseErrorCode.InvalidUnicode:
            return 'invalid unicode'
        case jsonParser.ParseErrorCode.PropertyNameExpected:
            return 'property name expected'
        case jsonParser.ParseErrorCode.UnexpectedEndOfComment:
            return 'unexpected end of comment'
        case jsonParser.ParseErrorCode.UnexpectedEndOfNumber:
            return 'unexpected end of number'
        case jsonParser.ParseErrorCode.UnexpectedEndOfString:
            return 'unexpected end of string'
        case jsonParser.ParseErrorCode.ValueExpected:
            return 'value expected'
        // By omitting the default case, we force the compiler to yell at us
        // if any enum members are added/removed/changed.
    }
}

export class TemplatesConfigFieldTypeError extends Error {
    public readonly jsonPath: jsonParser.JSONPath
    public readonly expectedTypes: jsonParser.NodeType[]
    public readonly actualType: jsonParser.NodeType

    public constructor(params: {
        message?: string
        jsonPath: jsonParser.JSONPath
        expectedTypes: jsonParser.NodeType[]
        actualType: jsonParser.NodeType
    }) {
        super(params.message)

        this.jsonPath = params.jsonPath
        this.expectedTypes = params.expectedTypes
        this.actualType = params.actualType
    }
}

export class TemplatesConfigPopulator {
    private isDirty: boolean = false

    public constructor(
        private json: string,
        private readonly modificationOptions: jsonParser.ModificationOptions = {
            formattingOptions: {
                insertSpaces: true,
                tabSize: getTabSizeSetting()
            }
        }
    ) {}

    public ensureTemplateSectionExists(templateRelativePath: string): TemplatesConfigPopulator {
        this.ensureTemplatesSectionExists()

        this.ensureJsonPropertyExists(['templates', templateRelativePath], {})

        return this
    }

    public ensureTemplateHandlerSectionExists(templateRelativePath: string, handler: string): TemplatesConfigPopulator {
        this.ensureTemplateHandlersSectionExists(templateRelativePath)

        this.ensureJsonPropertyExists(['templates', templateRelativePath, 'handlers', handler], {
            event: {},
            environmentVariables: {}
        })

        return this
    }

    public ensureTemplateHandlerPropertiesExist(
        templateRelativePath: string,
        handler: string
    ): TemplatesConfigPopulator {
        this.ensureTemplateHandlerSectionExists(templateRelativePath, handler)

        this.ensureJsonPropertyExists(['templates', templateRelativePath, 'handlers', handler, 'event'], {})

        this.ensureJsonPropertyExists(
            ['templates', templateRelativePath, 'handlers', handler, 'environmentVariables'],
            {}
        )

        return this
    }

    public ensureTemplateParameterOverrideExists(
        templateRelativePath: string,
        parameterName: string
    ): TemplatesConfigPopulator {
        this.ensureTemplateParameterOverridesSectionExists(templateRelativePath)

        this.ensureJsonPropertyExists(['templates', templateRelativePath, 'parameterOverrides', parameterName], '', [
            'string',
            'null'
        ])

        return this
    }

    public getResults(): {
        isDirty: boolean
        json: string
    } {
        return {
            isDirty: this.isDirty,
            json: this.json
        }
    }

    private ensureJsonPropertyExists(
        jsonPath: jsonParser.JSONPath,
        value: any,
        allowedTypes: jsonParser.NodeType[] = ['object', 'null']
    ) {
        const root = jsonParser.parseTree(this.json)
        const node = jsonParser.findNodeAtLocation(root, jsonPath)
        const allowedTypesSet = new Set(allowedTypes)

        if (node && !allowedTypesSet.has(node.type)) {
            throw new TemplatesConfigFieldTypeError({
                message: 'Invalid configuration',
                jsonPath: jsonPath,
                actualType: node.type,
                expectedTypes: allowedTypes
            })
        }

        if (!node || node.type === 'null') {
            const edits = jsonParser.modify(this.json, jsonPath, value, this.modificationOptions)

            if (edits.length > 0) {
                this.json = jsonParser.applyEdits(this.json, edits)
                this.isDirty = true
            }
        }
    }

    private ensureTemplatesSectionExists(): TemplatesConfigPopulator {
        this.ensureJsonPropertyExists(['templates'], {})

        return this
    }

    private ensureTemplateHandlersSectionExists(templateRelativePath: string): TemplatesConfigPopulator {
        this.ensureTemplateSectionExists(templateRelativePath)

        this.ensureJsonPropertyExists(['templates', templateRelativePath, 'handlers'], {})

        return this
    }

    private ensureTemplateParameterOverridesSectionExists(templateRelativePath: string): TemplatesConfigPopulator {
        this.ensureTemplateSectionExists(templateRelativePath)

        this.ensureJsonPropertyExists(['templates', templateRelativePath, 'parameterOverrides'], {})

        return this
    }
}
