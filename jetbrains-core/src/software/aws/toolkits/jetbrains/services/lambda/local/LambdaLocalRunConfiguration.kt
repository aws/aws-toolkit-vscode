package software.aws.toolkits.jetbrains.services.lambda.local

import com.intellij.codeInsight.completion.CompletionParameters
import com.intellij.codeInsight.completion.CompletionResultSet
import com.intellij.codeInsight.completion.PlainPrefixMatcher
import com.intellij.codeInsight.lookup.CharFilter
import com.intellij.codeInsight.lookup.LookupElementBuilder
import com.intellij.execution.ExecutionException
import com.intellij.execution.Executor
import com.intellij.execution.configurations.ConfigurationFactory
import com.intellij.execution.configurations.ConfigurationTypeBase
import com.intellij.execution.configurations.LocatableConfigurationBase
import com.intellij.execution.configurations.ModuleRunProfile
import com.intellij.execution.configurations.RefactoringListenerProvider
import com.intellij.execution.configurations.RunConfiguration
import com.intellij.execution.configurations.RunProfileState
import com.intellij.execution.configurations.RuntimeConfigurationError
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.json.JsonFileType
import com.intellij.json.JsonLanguage
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.options.SettingsEditor
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.openapi.ui.ComponentWithBrowseButton
import com.intellij.openapi.ui.TextComponentAccessor
import com.intellij.openapi.util.text.StringUtil
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.NavigatablePsiElement
import com.intellij.psi.PsiElement
import com.intellij.psi.util.PsiTreeUtil
import com.intellij.refactoring.listeners.RefactoringElementAdapter
import com.intellij.refactoring.listeners.RefactoringElementListener
import com.intellij.util.indexing.FileBasedIndex
import com.intellij.util.textCompletion.TextCompletionProvider
import com.intellij.util.xmlb.XmlSerializer
import icons.AwsIcons
import org.jdom.Element
import org.jetbrains.annotations.TestOnly
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.lambda.LambdaSampleEventProvider
import software.aws.toolkits.jetbrains.core.RemoteResourceResolverProvider
import software.aws.toolkits.jetbrains.services.lambda.Lambda.findPsiElementsForHandler
import software.aws.toolkits.jetbrains.services.lambda.LambdaHandlerIndex
import software.aws.toolkits.jetbrains.services.lambda.LambdaHandlerResolver
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroupExtensionPointObject
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import software.aws.toolkits.jetbrains.utils.ui.formatAndSet
import software.aws.toolkits.jetbrains.utils.ui.populateValues
import software.aws.toolkits.resources.message
import java.nio.charset.StandardCharsets
import javax.swing.JComboBox
import javax.swing.JPanel

class LambdaRunConfiguration :
    ConfigurationTypeBase("aws.lambda", message("lambda.service_name"), message("lambda.run_configuration.description"), AwsIcons.Logos.LAMBDA) {
    init {
        addFactory(LambdaLocalRunConfigurationFactory(this))
    }
}

class LambdaLocalRunConfigurationFactory(configuration: LambdaRunConfiguration) : ConfigurationFactory(configuration) {
    override fun createTemplateConfiguration(project: Project): RunConfiguration = LambdaLocalRunConfiguration(project, this)
}

class LambdaLocalRunConfiguration(project: Project, factory: ConfigurationFactory) : LocatableConfigurationBase(project, factory, "AWS Lambda"),
    ModuleRunProfile, RefactoringListenerProvider {
    internal var settings = PersistableLambdaRunSettings()

    override fun getConfigurationEditor(): SettingsEditor<out RunConfiguration> = LocalLambdaRunSettingsEditor(project)

    override fun checkConfiguration() {
        settings.validateAndCreateImmutable(project)
    }

    override fun getState(executor: Executor, environment: ExecutionEnvironment): RunProfileState {
        val settings = try {
            settings.validateAndCreateImmutable(project)
        } catch (e: Exception) {
            throw ExecutionException(e.message)
        }
        val provider = settings.runtime.runtimeGroup?.let { LambdaLocalRunProvider.getInstance(it) }
            ?: throw ExecutionException("Unable to find run provider for ${settings.runtime}")
        return provider.createRunProfileState(environment, project, settings)
    }

    override fun writeExternal(element: Element) {
        super.writeExternal(element)
        XmlSerializer.serializeInto(settings, element)
    }

    override fun readExternal(element: Element) {
        super.readExternal(element)
        XmlSerializer.deserializeInto(settings, element)
    }

    override fun suggestedName(): String? = settings.handler

    private fun getPsiElement(): PsiElement? {
        return try {
            settings.validateAndCreateImmutable(project).handlerElement
        } catch (e: Exception) {
            null
        }
    }

    override fun getRefactoringElementListener(element: PsiElement?): RefactoringElementListener? {
        element?.run {
            val handlerResolver = element.language.runtimeGroup?.let { runtimeGroup ->
                LambdaHandlerResolver.getInstance(runtimeGroup)
            } ?: return null

            val handlerPsi = getPsiElement() ?: return null

            if (PsiTreeUtil.isAncestor(element, handlerPsi, false)) {
                return object : RefactoringElementAdapter() {
                    private val originalHandler = settings.handler

                    override fun elementRenamedOrMoved(newElement: PsiElement) {
                        handlerResolver.determineHandler(handlerPsi)?.let { newHandler ->
                            settings.handler = newHandler
                        }
                    }

                    override fun undoElementMovedOrRenamed(newElement: PsiElement, oldQualifiedName: String) {
                        settings.handler = originalHandler
                    }
                }
            }
        }
        return null
    }

    @TestOnly
    fun configure(runtime: Runtime, handler: String, input: String? = null, envVars: MutableMap<String, String> = mutableMapOf()) {
        settings.input = input
        settings.runtime = runtime.name
        settings.handler = handler
        settings.environmentVariables = envVars
    }

    @TestOnly
    fun getHandler(): String? {
        return settings.handler
    }

    internal data class PersistableLambdaRunSettings(
        var runtime: String? = null,
        var handler: String? = null,
        var input: String? = null,
        var inputIsFile: Boolean = false,
        var environmentVariables: MutableMap<String, String> = mutableMapOf()
    ) {
        fun validateAndCreateImmutable(project: Project): LambdaRunSettings {
            val handler = handler ?: throw RuntimeConfigurationError(message("lambda.run_configuration.no_handler_specified"))
            val runtime = runtime?.let { Runtime.valueOf(it) } ?: throw RuntimeConfigurationError(message("lambda.run_configuration.no_runtime_specified"))
            val element = findPsiElementsForHandler(project, runtime, handler).firstOrNull()
                ?: throw RuntimeConfigurationError(message("lambda.run_configuration.handler_not_found", handler))
            val inputValue = input

            val inputText = if (inputIsFile && inputValue?.isNotEmpty() == true) {
                try {
                    LocalFileSystem.getInstance()
                        .refreshAndFindFileByPath(inputValue)
                        ?.contentsToByteArray(false)
                        ?.toString(StandardCharsets.UTF_8)
                            ?: throw RuntimeConfigurationError(message("lambda.run_configuration.input_file_error", inputValue))
                } catch (e: Exception) {
                    throw RuntimeConfigurationError(message("lambda.run_configuration.input_file_error", inputValue))
                }
            } else {
                inputValue
            }

            return LambdaRunSettings(runtime, handler, inputText, environmentVariables, element)
        }
    }
}

class LocalLambdaRunSettingsEditor(project: Project) : SettingsEditor<LambdaLocalRunConfiguration>() {
    private val view = LocalLambdaRunSettingsEditorPanel(project, HandlerCompletionProvider(project))
    private val eventProvider = LambdaSampleEventProvider(RemoteResourceResolverProvider.getInstance().get())

    init {
        val supported = LambdaLocalRunProvider.supportedRuntimeGroups.flatMap { it.runtimes }.map { it }.sorted()
        val selected =
            ProjectRootManager.getInstance(project).projectSdk
                ?.let { RuntimeGroup.runtimeForSdk(it) }
                ?.let { if (it in supported) it else null }
        view.runtime.populateValues(selected = selected) { supported }

        view.inputFile.addBrowseFolderListener(null, null, project, FileChooserDescriptorFactory.createSingleFileDescriptor(JsonFileType.INSTANCE))

        val actionListener = object : ComponentWithBrowseButton.BrowseFolderActionListener<JComboBox<*>>(
            null,
            null,
            view.inputTemplates,
            project,
            FileChooserDescriptorFactory.createSingleFileDescriptor(JsonFileType.INSTANCE),
            TextComponentAccessor.STRING_COMBOBOX_WHOLE_TEXT
        ) {
            override fun getInitialFile(): VirtualFile? {
                val file = project.baseDir
                if (file != null) {
                    return file
                }
                return super.getInitialFile()
            }

            override fun onFileChosen(chosenFile: VirtualFile) {
                view.eventComboBoxModel.selectedItem = null

                val contents = chosenFile.contentsToByteArray(false).toString(StandardCharsets.UTF_8)
                val cleanedUp = StringUtil.convertLineSeparators(contents)
                if (chosenFile.extension == "json") {
                    view.inputText.formatAndSet(cleanedUp, JsonLanguage.INSTANCE)
                } else {
                    view.inputText.text = cleanedUp
                }
            }
        }
        view.inputTemplates.addActionListener(actionListener)

        eventProvider.get().thenAccept { events ->
            runInEdt(ModalityState.any()) {
                view.eventComboBoxModel.setAll(events)
                view.eventComboBox.selectedItem = null
            }
        }

        view.eventComboBox.addActionListener { _ ->
            view.eventComboBoxModel.selectedItem?.let { event ->
                event.content.thenApply { content ->
                    val cleanedUp = StringUtil.convertLineSeparators(content)
                    runInEdt(ModalityState.any()) {
                        view.inputText.formatAndSet(cleanedUp, JsonLanguage.INSTANCE)
                    }
                }
            }
        }
    }

    override fun resetEditorFrom(configuration: LambdaLocalRunConfiguration) {
        view.runtime.selectedItem = configuration.settings.runtime?.let { Runtime.valueOf(it) }
        view.handler.setText(configuration.settings.handler)
        view.environmentVariables.envVars = configuration.settings.environmentVariables
        view.isUsingInputFile = configuration.settings.inputIsFile
        if (configuration.settings.inputIsFile) {
            view.inputFile.setText(configuration.settings.input)
        } else {
            view.inputText.setText(configuration.settings.input)
        }
    }

    override fun createEditor(): JPanel = view.panel

    override fun applyEditorTo(configuration: LambdaLocalRunConfiguration) {
        configuration.settings.runtime = (view.runtime.selectedItem as? Runtime)?.name
        configuration.settings.handler = view.handler.text
        configuration.settings.input = view.inputText.text
        configuration.settings.environmentVariables = view.environmentVariables.envVars.toMutableMap()
        configuration.settings.inputIsFile = view.isUsingInputFile
        configuration.settings.input = if (view.isUsingInputFile) {
            view.inputFile.text.trim()
        } else {
            view.inputText.text.trim()
        }
    }
}

class HandlerCompletionProvider(private val project: Project) : TextCompletionProvider {
    override fun applyPrefixMatcher(result: CompletionResultSet, prefix: String): CompletionResultSet = result.withPrefixMatcher(PlainPrefixMatcher(prefix))

    override fun getAdvertisement(): String? = null

    override fun getPrefix(text: String, offset: Int): String? = text

    override fun fillCompletionVariants(parameters: CompletionParameters, prefix: String, result: CompletionResultSet) {
        FileBasedIndex.getInstance().getAllKeys(LambdaHandlerIndex.NAME, project).forEach { result.addElement(LookupElementBuilder.create(it)) }
        result.stopHere()
    }

    override fun acceptChar(c: Char): CharFilter.Result? {
        return if (c.isWhitespace()) {
            CharFilter.Result.SELECT_ITEM_AND_FINISH_LOOKUP
        } else {
            CharFilter.Result.ADD_TO_PREFIX
        }
    }
}

class LambdaRunSettings(
    val runtime: Runtime,
    val handler: String,
    val input: String?,
    val environmentVariables: Map<String, String>,
    val handlerElement: NavigatablePsiElement
)

interface LambdaLocalRunProvider {
    fun createRunProfileState(environment: ExecutionEnvironment, project: Project, settings: LambdaRunSettings): RunProfileState

    companion object : RuntimeGroupExtensionPointObject<LambdaLocalRunProvider>(ExtensionPointName.create("aws.toolkit.lambda.localRunProvider"))
}