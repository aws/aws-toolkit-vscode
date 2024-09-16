import * as vscode from 'vscode'
import { CodewhispererLanguage } from '../../../shared'

// ProgrammingLanguageLanguageNameString defined in user-service-2.json
type QLanguage =
    | 'python'
    | 'javascript'
    | 'java'
    | 'csharp'
    | 'typescript'
    | 'c'
    | 'cpp'
    | 'go'
    | 'kotlin'
    | 'php'
    | 'ruby'
    | 'rust'
    | 'scala'
    | 'shell'
    | 'sql'
    | 'json'
    | 'yaml'
    | 'vue'
    | 'tf'
    | 'tsx'
    | 'jsx'

/**
 * 1. VSCode language ids
 * 2. CodewhispererLanguage defined in telemetry.gen.ts (client side)
 * 3. ProgrammingLanguageLanguageNameString defined in user-service-2.json
 * 4. Service runtime language is as same as (3)ProgrammingLanguageLanguageNameString except jsx -> js, tsx -> ts
 */
// TODO: security scan
export abstract class Language {
    abstract telemetryId: CodewhispererLanguage

    abstract runtimeLanguageId: Exclude<QLanguage, 'jsx' | 'tsx'>

    abstract vscodeLanguageId: vscode.TextDocument['languageId']

    abstract c9LanguageId: string

    isInlineSupported(): boolean {
        return false
    }

    isUtgSupported(): boolean {
        return false
    }

    isCrossfileSupported(): boolean {
        return false
    }
}

export const CLanguage = new (class extends Language {
    override telemetryId: CodewhispererLanguage = 'c'

    override runtimeLanguageId: Exclude<QLanguage, 'jsx' | 'tsx'> = 'c'

    override vscodeLanguageId = 'c'

    override c9LanguageId: string = this.vscodeLanguageId

    override isInlineSupported(): boolean {
        return true
    }
})()

export const CppLanguage = new (class extends Language {
    override telemetryId: CodewhispererLanguage = 'cpp'

    override runtimeLanguageId: Exclude<QLanguage, 'jsx' | 'tsx'> = 'cpp'

    override vscodeLanguageId = 'cpp'

    override c9LanguageId: string = 'c_cpp'

    override isInlineSupported(): boolean {
        return true
    }
})()

export const CSharpLanguage = new (class extends Language {
    telemetryId: CodewhispererLanguage = 'csharp'

    runtimeLanguageId: Exclude<QLanguage, 'jsx' | 'tsx'> = 'csharp'

    vscodeLanguageId = 'csharp'

    override c9LanguageId: string = this.vscodeLanguageId

    override isInlineSupported(): boolean {
        return true
    }
})()

export const GoLanguage = new (class extends Language {
    telemetryId: CodewhispererLanguage = 'go'

    runtimeLanguageId: Exclude<QLanguage, 'jsx' | 'tsx'> = 'go'

    vscodeLanguageId = 'go'

    override c9LanguageId: string = 'golang'

    override isInlineSupported(): boolean {
        return true
    }
})()

export const JavaLanguage = new (class extends Language {
    telemetryId: CodewhispererLanguage = 'java'

    runtimeLanguageId: Exclude<QLanguage, 'jsx' | 'tsx'> = 'java'

    vscodeLanguageId = 'java'

    override c9LanguageId: string = this.vscodeLanguageId

    override isInlineSupported(): boolean {
        return true
    }

    override isCrossfileSupported(): boolean {
        return true
    }

    override isUtgSupported(): boolean {
        return true
    }
})()

export const JavascriptLanguage = new (class extends Language {
    telemetryId: CodewhispererLanguage = 'javascript'

    runtimeLanguageId: Exclude<QLanguage, 'jsx' | 'tsx'> = 'javascript'

    vscodeLanguageId = 'javascript'

    override c9LanguageId: string = this.vscodeLanguageId

    override isInlineSupported(): boolean {
        return true
    }

    override isCrossfileSupported(): boolean {
        return true
    }
})()

export const JsonLanguage = new (class extends Language {
    telemetryId: CodewhispererLanguage = 'json'

    runtimeLanguageId: Exclude<QLanguage, 'jsx' | 'tsx'> = 'json'

    vscodeLanguageId = 'json'

    override c9LanguageId: string = this.vscodeLanguageId

    override isInlineSupported(): boolean {
        return true
    }
})()

export const JsxLanguage = new (class extends Language {
    telemetryId: CodewhispererLanguage = 'jsx'

    runtimeLanguageId: Exclude<QLanguage, 'jsx' | 'tsx'> = 'javascript'

    vscodeLanguageId = 'javascriptreact'

    override c9LanguageId: string = this.vscodeLanguageId

    override isInlineSupported(): boolean {
        return true
    }

    override isCrossfileSupported(): boolean {
        return true
    }
})()

export const KotlinLanguage = new (class extends Language {
    telemetryId: CodewhispererLanguage = 'kotlin'

    runtimeLanguageId: Exclude<QLanguage, 'jsx' | 'tsx'> = 'kotlin'

    vscodeLanguageId = 'kotlin'

    override c9LanguageId: string = this.vscodeLanguageId

    override isInlineSupported(): boolean {
        return true
    }
})()

export const PhpLanguage = new (class extends Language {
    telemetryId: CodewhispererLanguage = 'php'

    runtimeLanguageId: Exclude<QLanguage, 'jsx' | 'tsx'> = 'php'

    vscodeLanguageId = 'php'

    override c9LanguageId: string = this.vscodeLanguageId

    override isInlineSupported(): boolean {
        return true
    }
})()

export const PlaintextLanguage = new (class extends Language {
    telemetryId: CodewhispererLanguage = 'plaintext'

    runtimeLanguageId: Exclude<QLanguage, 'jsx' | 'tsx'> = 'plaintext' as any // TODO

    vscodeLanguageId = 'plaintext'

    override c9LanguageId: string = this.vscodeLanguageId
})()

export const PythonLanguage = new (class extends Language {
    override telemetryId: CodewhispererLanguage = 'python'

    override runtimeLanguageId: Exclude<QLanguage, 'jsx' | 'tsx'> = 'python'

    override vscodeLanguageId: string = 'python'

    override c9LanguageId: string = this.vscodeLanguageId

    override isInlineSupported(): boolean {
        return true
    }

    override isCrossfileSupported(): boolean {
        return true
    }

    override isUtgSupported(): boolean {
        return true
    }
})()

export const RubyLanguage = new (class extends Language {
    telemetryId: CodewhispererLanguage = 'ruby'

    runtimeLanguageId: Exclude<QLanguage, 'jsx' | 'tsx'> = 'ruby'

    vscodeLanguageId = 'ruby'

    override c9LanguageId: string = this.vscodeLanguageId

    override isInlineSupported(): boolean {
        return true
    }
})()

export const RustLanguage = new (class extends Language {
    telemetryId: CodewhispererLanguage = 'rust'

    runtimeLanguageId: Exclude<QLanguage, 'jsx' | 'tsx'> = 'rust'

    vscodeLanguageId = 'rust'

    override c9LanguageId: string = this.vscodeLanguageId

    override isInlineSupported(): boolean {
        return true
    }
})()

export const ScalaLanguage = new (class extends Language {
    telemetryId: CodewhispererLanguage = 'scala'

    runtimeLanguageId: Exclude<QLanguage, 'jsx' | 'tsx'> = 'scala'

    vscodeLanguageId = 'scala'

    override c9LanguageId: string = this.vscodeLanguageId

    override isInlineSupported(): boolean {
        return true
    }
})()

export const ShellLanguage = new (class extends Language {
    telemetryId: CodewhispererLanguage = 'shell'

    runtimeLanguageId: Exclude<QLanguage, 'jsx' | 'tsx'> = 'shell'

    vscodeLanguageId = 'shellscript'

    override c9LanguageId: string = 'sh'

    override isInlineSupported(): boolean {
        return true
    }
})()

export const SqlLanguage = new (class extends Language {
    telemetryId: CodewhispererLanguage = 'sql'

    runtimeLanguageId: Exclude<QLanguage, 'jsx' | 'tsx'> = 'sql'

    vscodeLanguageId = 'sql'

    override c9LanguageId: string = this.vscodeLanguageId

    override isInlineSupported(): boolean {
        return true
    }
})()

export const TerraformLanguage = new (class extends Language {
    telemetryId: CodewhispererLanguage = 'tf'

    runtimeLanguageId: Exclude<QLanguage, 'jsx' | 'tsx'> = 'tf'

    vscodeLanguageId = 'terraform'

    override c9LanguageId: string = this.vscodeLanguageId

    override isInlineSupported(): boolean {
        return true
    }
})()

export const TerragruntLanguage = new (class extends Language {
    telemetryId: CodewhispererLanguage = 'tf'

    runtimeLanguageId: Exclude<QLanguage, 'jsx' | 'tsx'> = 'tf'

    vscodeLanguageId = 'terragrunt'

    override c9LanguageId: string = this.vscodeLanguageId

    override isInlineSupported(): boolean {
        return true
    }
})()

export const TsxLanguage = new (class extends Language {
    telemetryId: CodewhispererLanguage = 'tsx'

    runtimeLanguageId: Exclude<QLanguage, 'jsx' | 'tsx'> = 'typescript'

    vscodeLanguageId = 'typescriptreact'

    override c9LanguageId: string = this.vscodeLanguageId

    override isInlineSupported(): boolean {
        return true
    }

    override isCrossfileSupported(): boolean {
        return true
    }
})()

export const TypescriptLanguage = new (class extends Language {
    telemetryId: CodewhispererLanguage = 'typescript'

    runtimeLanguageId: Exclude<QLanguage, 'jsx' | 'tsx'> = 'typescript'

    vscodeLanguageId = 'typescript'

    override c9LanguageId: string = this.vscodeLanguageId

    override isInlineSupported(): boolean {
        return true
    }

    override isCrossfileSupported(): boolean {
        return true
    }
})()

export const YamlLanguage = new (class extends Language {
    telemetryId: CodewhispererLanguage = 'yaml'

    runtimeLanguageId: Exclude<QLanguage, 'jsx' | 'tsx'> = 'yaml'

    vscodeLanguageId = 'yaml'

    override c9LanguageId: string = this.vscodeLanguageId

    override isInlineSupported(): boolean {
        return true
    }
})()
