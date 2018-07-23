package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.execution.JavaExecutionUtil
import com.intellij.lang.jvm.JvmModifier
import com.intellij.openapi.compiler.CompilerManager
import com.intellij.openapi.compiler.CompilerMessageCategory
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.module.Module
import com.intellij.openapi.roots.LibraryOrderEntry
import com.intellij.openapi.roots.ModuleOrderEntry
import com.intellij.openapi.roots.OrderEnumerator
import com.intellij.openapi.roots.OrderRootType
import com.intellij.openapi.roots.libraries.Library
import com.intellij.psi.JavaPsiFacade
import com.intellij.psi.PsiClass
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.PsiIdentifier
import com.intellij.psi.PsiMethod
import com.intellij.psi.PsiModifierListOwner
import com.intellij.psi.PsiParameter
import com.intellij.psi.search.GlobalSearchScope
import com.intellij.psi.util.PsiUtil
import com.intellij.util.io.exists
import com.intellij.util.io.inputStream
import com.intellij.util.io.isDirectory
import com.intellij.util.io.isHidden
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.utils.createTemporaryZipFile
import software.aws.toolkits.core.utils.putNextEntry
import software.aws.toolkits.jetbrains.services.lambda.upload.LambdaLineMarker
import software.aws.toolkits.resources.message
import java.io.InputStream
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage
import kotlin.streams.toList

class JavaLambdaLineMarker : LambdaLineMarker() {

    override fun getHandlerName(element: PsiElement): String? {
        val parent = (element as? PsiIdentifier)?.parent ?: return null

        return when (parent) {
            is PsiClass -> findByClass(parent)
            is PsiMethod -> findByMethod(parent)
            else -> null
        }
    }

    private fun findByMethod(method: PsiMethod): String? {
        val parentClass = method.parent as? PsiClass ?: return null
        if (method.isPublic &&
            (method.isStatic ||
                    (parentClass.canBeInstantiatedByLambda() && !parentClass.implementsLambdaHandlerInterface())) &&
            method.hasRequiredParameters()
        ) {
            return "${parentClass.qualifiedName}::${method.name}"
        }
        return null
    }

    private fun findByClass(clz: PsiClass): String? =
        if (clz.canBeInstantiatedByLambda() && clz.implementsLambdaHandlerInterface()) {
            clz.qualifiedName
        } else {
            null
        }

    private fun PsiClass.canBeInstantiatedByLambda() =
        this.isPublic && this.isConcrete && this.hasPublicNoArgsConstructor()

    private val PsiModifierListOwner.isPublic get() = this.hasModifier(JvmModifier.PUBLIC)

    private val PsiModifierListOwner.isStatic get() = this.hasModifier(JvmModifier.STATIC)

    private val PsiClass.isConcrete get() = !this.isInterface && !this.hasModifier(JvmModifier.ABSTRACT)

    private fun PsiClass.hasPublicNoArgsConstructor() =
        this.constructors.isEmpty() || this.constructors.any { it.hasModifier(JvmModifier.PUBLIC) && it.parameters.isEmpty() }

    private fun PsiClass.implementsLambdaHandlerInterface(): Boolean {
        val module = JavaExecutionUtil.findModule(this)
        val scope = GlobalSearchScope.moduleRuntimeScope(module, false)
        val psiFacade = JavaPsiFacade.getInstance(module.project)

        return LAMBDA_INTERFACES.any { interfaceName ->
            psiFacade.findClass(interfaceName, scope)?.let { interfacePsi ->
                this.isInheritor(interfacePsi, true)
            } == true
        }
    }

    private fun PsiMethod.hasRequiredParameters(): Boolean =
        this.parameters.size in 1..2 && this.parameterList.parameters.getOrNull(1)?.isContextParameter() ?: true

    private fun PsiParameter.isContextParameter() =
        PsiUtil.resolveClassInType(this.type)?.qualifiedName == LAMBDA_CONTEXT

    private companion object {
        val LAMBDA_INTERFACES = setOf(
            "com.amazonaws.services.lambda.runtime.RequestStreamHandler",
            "com.amazonaws.services.lambda.runtime.RequestHandler"
        )
        const val LAMBDA_CONTEXT = "com.amazonaws.services.lambda.runtime.Context"
    }
}

class JavaLambdaPackager : LambdaPackager {
    override fun createPackage(module: Module, file: PsiFile): CompletionStage<Path> {
        val future = CompletableFuture<Path>()
        CompilerManager.getInstance(module.project).rebuild { aborted, errors, _, context ->
            if (!aborted && errors == 0) {
                try {
                    val zipContents = mutableSetOf<ZipEntry>()
                    entriesForModule(module, zipContents)
                    val zipFile = createTemporaryZipFile { zip -> zipContents.forEach { zip.putNextEntry(it.pathInZip, it.sourceFile) } }
                    LOG.debug("Created temporary zip: $zipFile")
                    future.complete(zipFile)
                } catch (e: Exception) {
                    future.completeExceptionally(RuntimeException(message("lambda.package.zip_fail"), e))
                }
            } else if (aborted) {
                future.completeExceptionally(RuntimeException(message("lambda.package.compilation_aborted")))
            } else {
                val errorMessages = context.getMessages(CompilerMessageCategory.ERROR).joinToString("\n")
                future.completeExceptionally(RuntimeException(message("lambda.package.compilation_errors", errorMessages)))
            }
        }
        return future
    }

    override fun determineRuntime(module: Module, file: PsiFile): Runtime = Runtime.JAVA8

    private fun entriesForModule(module: Module, entries: MutableSet<ZipEntry>) {
        productionRuntimeEntries(module).forEach {
            when (it) {
                is ModuleOrderEntry -> it.module?.run { entriesForModule(this, entries) }
                is LibraryOrderEntry -> it.library?.run { addLibrary(this, entries) }
            }
            true
        }
        addModuleFiles(module, entries)
    }

    private fun addLibrary(library: Library, entries: MutableSet<ZipEntry>) {
        library.getFiles(OrderRootType.CLASSES).map { Paths.get(it.presentableUrl) }.forEach { entries.add(ZipEntry("lib/${it.fileName}", it)) }
    }

    private fun addModuleFiles(module: Module, entries: MutableSet<ZipEntry>) {
        productionRuntimeEntries(module)
            .withoutDepModules()
            .withoutLibraries()
            .pathsList.pathList
            .map { Paths.get(it) }
            .filter { it.exists() }
            .flatMap {
                when {
                    it.isDirectory() -> toEntries(it)
                    else -> throw RuntimeException(message("lambda.package.unhandled_file_type", it))
                }
            }
            .forEach { entries.add(it) }
    }

    private fun productionRuntimeEntries(module: Module) = OrderEnumerator.orderEntries(module).productionOnly().runtimeOnly().withoutSdk()

    private fun toEntries(path: Path): List<ZipEntry> =
        Files.walk(path).use { files ->
            files.filter { !it.isDirectory() && !it.isHidden() && it.exists() }.map { ZipEntry(path.relativize(it).toString().replace('\\', '/'), it) }.toList()
        }

    private data class ZipEntry(val pathInZip: String, val sourceFile: InputStream) {
        constructor(pathInZip: String, sourceFile: Path) : this(pathInZip, sourceFile.inputStream())
    }

    companion object {
        val LOG = Logger.getInstance(JavaLambdaPackager::class.java)
    }
}
