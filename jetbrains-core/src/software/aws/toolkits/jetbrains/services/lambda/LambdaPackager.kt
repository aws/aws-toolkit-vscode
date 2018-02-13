package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.lang.Language
import com.intellij.lang.LanguageExtensionPoint
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.module.Module
import com.intellij.openapi.util.KeyedExtensionCollector
import com.intellij.psi.PsiFile
import software.amazon.awssdk.services.lambda.model.Runtime
import java.nio.file.Path


interface LambdaPackager {
    /**
     * Creates a package for the given lambda including source files archived in the correct format.
     *
     * Calls [onComplete] with the path of the file when finished.
     */
    fun createPackage(module: Module, file: PsiFile, onComplete: (Path) -> Unit)

    /**
     * For a given [module] and [file] try to infer the Lambda language runtime
     */
    fun determineRuntime(module: Module, file: PsiFile): Runtime
}

object LambdaPackagerProvider {
    private val EP_NAME = ExtensionPointName<LanguageExtensionPoint<LambdaPackager>>("aws.toolkit.lambdaPackager")
    private val COLLECTOR = KeyedExtensionCollector<LambdaPackager, String>(EP_NAME.name);
    fun getInstance(language: Language): LambdaPackager = COLLECTOR.findSingle(language.id)
    fun supportedLanguages(): Set<Language> = EP_NAME.extensions.mapNotNull { it?.language?.let { Language.findLanguageByID(it) } }.toSet()
}