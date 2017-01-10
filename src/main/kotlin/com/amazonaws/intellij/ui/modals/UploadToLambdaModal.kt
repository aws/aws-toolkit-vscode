package com.amazonaws.intellij.ui.modals

import com.amazonaws.services.identitymanagement.AmazonIdentityManagement
import com.amazonaws.services.identitymanagement.AmazonIdentityManagementClient
import com.amazonaws.services.identitymanagement.model.CreateRoleRequest
import com.amazonaws.services.s3.AmazonS3
import com.amazonaws.services.s3.AmazonS3Client
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.psi.PsiClass
import com.intellij.psi.PsiFile
import java.awt.GridBagConstraints
import java.awt.GridBagLayout
import javax.swing.*

class UploadToLambdaModal(private val project: Project, private val psi: PsiFile) : DialogWrapper(project) {

    init {
        super.init()
        title = "Uploading to Lambda"
    }

    override fun createCenterPanel(): JComponent? {


        val eventHandler = UploadToLambdaModalEventHandler(AmazonS3Client(), AmazonIdentityManagementClient())
        val view = UploadToLambdaModalView(eventHandler)
        val controller = UploadToLambdaController(view, psi)
        controller.load()
        return view
    }


}

class UploadToLambdaController(private val view: UploadToLambdaModalView, private val psi: PsiFile) {
    fun load() {
        val possibleFunctions = findPossibleFunctions()
        if (possibleFunctions.isNotEmpty()) {
            view.updateAvailableHandlers(possibleFunctions)
            view.enableHandlerPicker(true)
        } else {
            view.enableHandlerPicker(false)
            view.updateAvailableHandlers(listOf("No public methods found"))
        }
    }

    private fun findPossibleFunctions(): List<String> {
        val clz = psi.children.filter { it is PsiClass }.map { it as PsiClass }.first()
        val publicMethods = clz.methods.filter { it.modifierList.hasModifierProperty("public") }
        return publicMethods.map { "${clz.qualifiedName}::${it.name}" }
    }
}

class UploadToLambdaModalEventHandler(private val s3: AmazonS3, private val iam: AmazonIdentityManagement) {
    fun createS3BucketClicked(source: UploadToLambdaModalView) {
        val bucketName = JOptionPane.showInputDialog(source, "S3 Bucket Name:", "Create S3 Bucket", JOptionPane.PLAIN_MESSAGE)
        if (bucketName != null) run {
            s3.createBucket(bucketName)
        }
    }

    fun createIamRoleClicked(source: UploadToLambdaModalView) {
        val iamRole = JOptionPane.showInputDialog(source, "Role Name:", "Create IAM Role", JOptionPane.PLAIN_MESSAGE)
        if (iamRole != null) run {
            iam.createRole(CreateRoleRequest().withRoleName(iamRole))
        }
    }
}

class UploadToLambdaModalView(private val eventHandler: UploadToLambdaModalEventHandler) : JPanel(GridBagLayout()) {

    private val handlerPicker = JComboBox<String>()
    private val iamRolePicker = JComboBox<String>()
    private val functionName = JTextField()
    private val functionDescription = JTextField()
    private val createIamRoleButton = JButton("Create")
    private val s3BucketPicker = JComboBox<String>()
    private val createS3Bucket = JButton("Create")

    init {
        add(JLabel("Name:"), constraint(0, 0))
        add(functionName, constraint(1, 0, width = 3))
        add(JLabel("Description:"), constraint(0,1))
        add(functionDescription, constraint(1, 1, width = 3))

        add(JSeparator(SwingConstants.HORIZONTAL), constraint(0, 3, width = 4))

        add(JLabel("Handler:"), constraint(0, 4))
        add(handlerPicker, constraint(1, 4, width = 3))
        handlerPicker.isEnabled = false
        add(JLabel("IAM Role:"), constraint(0, 5))
        add(iamRolePicker, constraint(1, 5, width = 2))
        iamRolePicker.isEnabled = false
        add(createIamRoleButton, constraint(3, 5, width = 1, fillHorizontal = false, alignLeft = false))
        createIamRoleButton.addActionListener { eventHandler.createIamRoleClicked(this) }

        add(JSeparator(SwingConstants.HORIZONTAL), constraint(0, 6, width = 4))

        add(JLabel("S3 Bucket:"), constraint(0, 7))
        add(s3BucketPicker, constraint(1, 7, width = 2))
        s3BucketPicker.isEnabled = false
        add(createS3Bucket, constraint(3, 7, width = 1, fillHorizontal = false, alignLeft = false))
        createS3Bucket.addActionListener { eventHandler.createS3BucketClicked(this) }
    }

    private fun constraint(x: Int, y: Int, width: Int = 1, fillHorizontal: Boolean = true, alignLeft: Boolean = true): GridBagConstraints {
        val c = GridBagConstraints()
        if (fillHorizontal) {
            c.fill = GridBagConstraints.HORIZONTAL
        }
        c.gridx = x
        c.gridy = y
        c.gridwidth = width
        c.anchor = if (alignLeft) GridBagConstraints.WEST else GridBagConstraints.EAST
        return c
    }

    fun updateAvailableHandlers(handlers: List<String>) = updatePicker(handlerPicker, handlers)

    fun enableHandlerPicker(enable: Boolean) { handlerPicker.isEnabled = enable }

    fun updateIamRoles(roles: List<String>) = updatePicker(iamRolePicker, roles)

    fun enableIamRolesPicker(enable: Boolean) { iamRolePicker.isEnabled = enable }

    private fun <T> updatePicker(picker: JComboBox<T>, values: Iterable<T>) {
        val model = (picker.model as DefaultComboBoxModel<T>)
        model.removeAllElements()
        values.forEach { model.addElement(it) }
    }
}
