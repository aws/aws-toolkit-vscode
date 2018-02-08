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

class JavaLambdaPackager : LambdaPackager {
    override fun createPackage(project: Project, onComplete: (Path) -> Unit) {
        CompilerManager.getInstance(project).rebuild { aborted, errors, _, compileContext ->
            if (!aborted && errors == 0) {
                val classes = compileContext.projectCompileScope.affectedModules
                        .map { compileContext.getModuleOutputDirectory(it) }
                        .flatMap {
                            val outputDir = it?.toPath()
                            Files.walk(outputDir)
                                    .filter { it.toString().toLowerCase().endsWith(".class") }
                                    .map { Pair(outputDir?.relativize(it), it) }.collect(Collectors.toList<Pair<Path?, Path>>())
                        }.filterNotNull()

                val dependencies = LibraryTablesRegistrar.getInstance().getLibraryTable(project).libraries
                        .flatMap { it.getFiles(OrderRootType.CLASSES).toList() }
                        .map { VfsUtil.getVirtualFileForJar(it) }
                        .map { it?.toPath() }.filterNotNull()

                val zipFile = Files.createTempFile("function", ".zip")
                val zip = ZipOutputStream(Files.newOutputStream(zipFile))

                dependencies.forEach { addEntry("lib/${it.fileName}", it, zip) }
                classes.forEach { addEntry(it.first.toString(), it.second, zip) }

                zip.close()
                onComplete(zipFile)
            }
        }
    }

    private fun addEntry(entryName: String, file: Path, zip: ZipOutputStream) {
        zip.putNextEntry(ZipEntry(entryName))
        val bytes = Files.readAllBytes(file)
        zip.write(bytes, 0, bytes.size)
        zip.closeEntry()
    }

    private fun VirtualFile.toPath(): Path {
        return Paths.get(File(this.path).toURI())
    }

}