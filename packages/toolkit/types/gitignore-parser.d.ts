declare module '@gerhobbelt/gitignore-parser' {
    export interface GitIgnoreAcceptor {
        accepts(filePath: string)
    }
    export function compile(content: string): GitIgnoreAcceptor
}
