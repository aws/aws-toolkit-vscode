package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiElementVisitor
import com.intellij.util.indexing.DataIndexer
import com.intellij.util.indexing.DefaultFileTypeSpecificInputFilter
import com.intellij.util.indexing.FileBasedIndex
import com.intellij.util.indexing.FileContent
import com.intellij.util.indexing.ID
import com.intellij.util.indexing.ScalarIndexExtension
import com.intellij.util.io.EnumeratorStringDescriptor
import com.intellij.util.io.KeyDescriptor

class LambdaHandlerIndex : ScalarIndexExtension<String>() {
    private val fileFilter by lazy {
        val supportedFiles = LambdaHandlerResolver.supportedLanguages.mapNotNull { it.associatedFileType }.toTypedArray()
        object : DefaultFileTypeSpecificInputFilter(*supportedFiles) {
            override fun acceptInput(file: VirtualFile): Boolean = file.isInLocalFileSystem
        }
    }

    override fun getName() = NAME

    override fun getVersion() = 1

    override fun dependsOnFileContent() = true

    override fun getIndexer(): DataIndexer<String, Void?, FileContent> = DataIndexer {
        val handlerIdentifier = it.psiFile.language.runtimeGroup?.let { LambdaHandlerResolver.getInstance(it) } ?: return@DataIndexer emptyMap<String, Void?>()

        val handlers = mutableMapOf<String, Void?>()

        recursePsiTree(it.psiFile, object : PsiElementVisitor() {
            override fun visitElement(element: PsiElement?) {
                super.visitElement(element)
                element?.run {
                    val handler = handlerIdentifier.determineHandler(this) ?: return@run
                    handlers[handler] = null
                }
            }
        })

        handlers
    }

    override fun getInputFilter(): FileBasedIndex.InputFilter = fileFilter

    override fun getKeyDescriptor(): KeyDescriptor<String> = EnumeratorStringDescriptor.INSTANCE

    companion object {
        val NAME: ID<String, Void> = ID.create("LambdaHandlerIndex")

        fun recursePsiTree(psi: PsiElement, visitor: PsiElementVisitor) {
            psi.accept(visitor)
            psi.children.forEach { recursePsiTree(it, visitor) }
        }
    }
}