import { Uri, Disposable } from 'vscode'
import { FileProvider, VirualFileSystem } from '../shared/virtualFilesystem'
import { LogStreamRegistry } from './registry/logStreamRegistry'

export class CloudWatchLogsFileSystem extends VirualFileSystem {
    public constructor(private registry: LogStreamRegistry, errorMessage?: string) {
        super()
        console.log('constructed')
    }

    public registerProvider(uri: Uri, provider: FileProvider): Disposable {
        console.log('provider')
        return { dispose: () => {} }
    }
}
