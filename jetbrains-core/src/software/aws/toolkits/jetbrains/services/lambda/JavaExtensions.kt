package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.lang.jvm.JvmModifier
import com.intellij.openapi.compiler.CompilerManager
import com.intellij.openapi.module.Module
import com.intellij.openapi.roots.OrderRootType
import com.intellij.openapi.roots.libraries.LibraryTablesRegistrar
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiClass
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.PsiIdentifier
import com.intellij.psi.PsiMethod
import com.intellij.psi.PsiModifierListOwner
import com.intellij.psi.PsiParameter
import com.intellij.psi.util.PsiUtil
import com.intellij.util.io.exists
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.utils.createTemporaryZipFile
import software.aws.toolkits.core.utils.putNextEntry
import software.aws.toolkits.jetbrains.services.lambda.upload.LambdaLineMarker
import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.util.stream.Collectors

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
        if (method.isPublic && (method.isStatic || (parentClass.canBeInstantiatedByLambda() && !parentClass.implementsLambdaHandlerInterface())) && method.hasRequiredParameters()) {
            return "${parentClass.qualifiedName}::${method.name}"
        }
        return null
    }

    private fun findByClass(clz: PsiClass): String? = if (clz.canBeInstantiatedByLambda() && clz.implementsLambdaHandlerInterface()) {
        clz.qualifiedName
    } else {
        null
    }

    private fun PsiClass.canBeInstantiatedByLambda() = this.isPublic && this.isConcrete && this.hasPublicNoArgsConstructor()

    private val PsiModifierListOwner.isPublic get() = this.hasModifier(JvmModifier.PUBLIC)

    private val PsiModifierListOwner.isStatic get() = this.hasModifier(JvmModifier.STATIC)

    private val PsiClass.isConcrete get() = !this.isInterface && !this.hasModifier(JvmModifier.ABSTRACT)

    private fun PsiClass.hasPublicNoArgsConstructor() =
            this.constructors.isEmpty() || this.constructors.any { it.hasModifier(JvmModifier.PUBLIC) && it.parameters.isEmpty() }

    private fun PsiClass.implementsLambdaHandlerInterface(): Boolean =
            this.supers.any { LAMBDA_INTERFACES.contains(it.qualifiedName) } || this.supers.any { it.implementsLambdaHandlerInterface() }

    private fun PsiMethod.hasRequiredParameters(): Boolean =
            this.parameters.size in 1..2 && this.parameterList.parameters.getOrNull(1)?.isContextParameter() ?: true

    private fun PsiParameter.isContextParameter() = PsiUtil.resolveClassInType(this.type)?.qualifiedName == LAMBDA_CONTEXT

    private companion object {

        val LAMBDA_INTERFACES = setOf(
                "com.amazonaws.services.lambda.runtime.RequestStreamHandler",
                "com.amazonaws.services.lambda.runtime.RequestHandler"
        )
        const val LAMBDA_CONTEXT = "com.amazonaws.services.lambda.runtime.Context"
    }
}

class JavaLambdaPackager : LambdaPackager {
    override fun createPackage(module: Module, file: PsiFile, onComplete: (Path) -> Unit) {
        CompilerManager.getInstance(module.project).rebuild { aborted, errors, _, compileContext ->
            if (!aborted && errors == 0) {
                val classes = compileContext.projectCompileScope.affectedModules
                        .map { compileContext.getModuleOutputDirectory(it) }
                        .flatMap {
                            val outputDir = it?.toPath()
                            Files.walk(outputDir)
                                    .filter { it.toString().toLowerCase().endsWith(".class") }
                                    .map { Pair(outputDir?.relativize(it), it) }.collect(Collectors.toList<Pair<Path?, Path>>())
                        }.filterNotNull()

                val dependencies = LibraryTablesRegistrar.getInstance().getLibraryTable(module.project).libraries
                        .flatMap { it.getFiles(OrderRootType.CLASSES).toList() }
                        .map { VfsUtil.getVirtualFileForJar(it) }
                        .mapNotNull { it?.toPath() }
                        .filter { it.exists() }

                val zipFile = createTemporaryZipFile { zip ->
                    dependencies.forEach { zip.putNextEntry("lib/${it.fileName}", it) }
                    classes.forEach { zip.putNextEntry(it.first.toString(), it.second) }
                }
                onComplete(zipFile)
            }
        }
    }

    private fun VirtualFile.toPath(): Path {
        return Paths.get(File(this.path).toURI())
    }

    override fun determineRuntime(module: Module, file: PsiFile): Runtime = Runtime.JAVA8
}