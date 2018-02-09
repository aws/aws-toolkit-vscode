package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.lang.Language
import com.intellij.lang.LanguageExtensionPoint
import com.intellij.openapi.compiler.CompilerManager
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.OrderRootType
import com.intellij.openapi.roots.libraries.LibraryTablesRegistrar
import com.intellij.openapi.util.KeyedExtensionCollector
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.util.stream.Collectors
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream


interface LambdaPackager {
    /**
     * Creates a package for the given lambda including source files archived in the correct format.
     *
     * Calls [onComplete] with the path of the file when finished.
     */
    fun createPackage(project: Project, onComplete: (Path) -> Unit)
}

object LambdaPackagerProvider {
    val EP_NAME = ExtensionPointName<LanguageExtensionPoint<LambdaPackager>>("aws.toolkit.lambdaPackager")
    private val COLLECTOR = KeyedExtensionCollector<LambdaPackager, String>(EP_NAME.name);
    fun getInstance(language: Language): LambdaPackager = COLLECTOR.findSingle(language.id)
    fun supportedLanguages(): Set<Language> = EP_NAME.extensions.mapNotNull { it?.language?.let { Language.findLanguageByID(it) } }.toSet()
}