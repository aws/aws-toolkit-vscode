package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.ui.IdeBorderFactory
import java.awt.Component
import java.util.function.Function
import javax.swing.Action
import javax.swing.JComponent

class CredentialsDialog(private val profileEditor: ProfileEditor<*>, parentComponent: Component) :
        DialogWrapper(parentComponent, false) {
    lateinit var validator: Function<CredentialsDialog, ValidationInfo?>

    init {
        setResizable(false)
    }

    override fun createNorthPanel(): JComponent? {
        return profileEditor.profileNameEditor.panel
    }

    override fun createCenterPanel(): JComponent? {
        val component = profileEditor.editorComponent
        component.border = IdeBorderFactory.createTitledBorder("Profile Options", true)
        return component
    }

    override fun doValidate(): ValidationInfo? {
        return validator.apply(this) ?: profileEditor.validateEditor()
    }

    override fun createActions(): Array<Action> {
        return arrayOf(okAction, cancelAction)
    }

    override fun show() {
        init()
        super.show()
    }
}
