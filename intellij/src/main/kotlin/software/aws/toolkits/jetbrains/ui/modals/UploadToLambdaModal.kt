package software.aws.toolkits.jetbrains.ui.modals

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.openapi.util.Computable
import com.intellij.psi.PsiClass
import com.intellij.psi.PsiFile
import software.amazon.awssdk.services.iam.IAMClient
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.Bucket
import software.aws.toolkits.jetbrains.aws.IamRole
import software.aws.toolkits.jetbrains.aws.lambda.FunctionUploadDetails
import software.aws.toolkits.jetbrains.core.AwsClientManager
import java.awt.GridBagConstraints
import java.awt.GridBagLayout
import javax.swing.DefaultComboBoxModel
import javax.swing.JButton
import javax.swing.JComboBox
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JOptionPane
import javax.swing.JPanel
import javax.swing.JSeparator
import javax.swing.JTextField
import javax.swing.SwingConstants
import javax.swing.SwingUtilities

class UploadToLambdaModal(
    private val project: Project,
    private val psi: PsiFile,
    private val okHandler: (FunctionUploadDetails) -> Unit
) : DialogWrapper(project) {
    private val clientManager = AwsClientManager.getInstance(project)
    private val view =
            UploadToLambdaModalView(UploadToLambdaModalEventHandler(clientManager.getClient(), clientManager.getClient()))

    init {
        super.init()
        title = "Uploading to Lambda"
    }

    override fun createCenterPanel(): JComponent? {
        val controller = UploadToLambdaController(view, psi, AwsClientManager.getInstance(project))
        controller.load()
        return view
    }

    override fun doValidate(): ValidationInfo? {
        if (view.functionName().isNullOrBlank()) return ValidationInfo(
                "Function Name must be specified",
                view.functionName
        )
        if (view.handler().isNullOrBlank()) return ValidationInfo("Handler must be specified", view.handlerPicker)
        if (view.iamRole() == null) return ValidationInfo("Iam role must be specified", view.iamRolePicker)
        if (view.s3Bucket() == null) return ValidationInfo("S3 bucket must be specified", view.s3BucketPicker)
        //TODO: Only show buckets that have the correct region
        return super.doValidate()
    }

    override fun doOKAction() {
        super.doOKAction()
        okHandler(
                FunctionUploadDetails(
                        name = view.functionName()!!,
                        handler = view.handler()!!,
                        iamRole = view.iamRole()!!,
                        s3Bucket = view.s3Bucket()!!,
                        description = view.description()!!
                )
        )
    }
}

class UploadToLambdaController(
    private val view: UploadToLambdaModalView,
    private val psi: PsiFile,
    private val clientManager: AwsClientManager
) {
    fun load() {
        populatePicker({ findPossibleFunctions() },
                { handlers -> view.updateAvailableHandlers(handlers) },
                { enable -> view.enableHandlerPicker(enable) })

        populatePicker({
            clientManager.getClient<IAMClient>().listRoles().roles().filterNotNull()
                    .map { IamRole(name = it.roleName(), arn = it.arn()) }
        },
                { roles -> view.updateIamRoles(roles) },
                { enable -> view.enableIamRolesPicker(enable) }
        )

        populatePicker({ clientManager.getClient<S3Client>().listBuckets().buckets().filterNotNull() },
                { buckets -> view.updateBuckets(buckets) },
                { enable -> view.enableBucketPicker(enable) }
        )
    }

    private fun <T> populatePicker(fetch: () -> List<T>, populate: (List<T>) -> Unit, enable: (Boolean) -> Unit) {
        ApplicationManager.getApplication().executeOnPooledThread {
            val items = fetch()
            SwingUtilities.invokeLater {
                if (items.isNotEmpty()) {
                    populate(items)
                    enable(true)
                } else {
                    enable(false)
                }
            }
        }
    }

    private fun findPossibleFunctions(): List<String> {
        return ApplicationManager.getApplication().runReadAction(Computable {
            val clz = psi.children.filter { it is PsiClass }.map { it as PsiClass }.first()
            val publicMethods = clz.methods.filter { it.modifierList.hasModifierProperty("public") }
            publicMethods.map { "${clz.qualifiedName}::${it.name}" }
        })
    }
}

class UploadToLambdaModalEventHandler(private val s3Client: S3Client, private val iamClient: IAMClient) {
    fun createS3BucketClicked(source: UploadToLambdaModalView) {
        val bucketName =
                JOptionPane.showInputDialog(source, "S3 Bucket Name:", "Create S3 Bucket", JOptionPane.PLAIN_MESSAGE)
        if (bucketName != null) run {
            s3Client.createBucket { it.bucket(bucketName) }
        }
    }

    fun createIamRoleClicked(source: UploadToLambdaModalView) {
        val iamRole = JOptionPane.showInputDialog(source, "Role Name:", "Create IAM Role", JOptionPane.PLAIN_MESSAGE)
        if (iamRole != null) run {
            iamClient.createRole { it.roleName(iamRole) }
        }
    }
}

class UploadToLambdaModalView(private val eventHandler: UploadToLambdaModalEventHandler) : JPanel(GridBagLayout()) {

    internal val handlerPicker = ComboBox<String>()
    internal val iamRolePicker = ComboBox<IamRole>()
    internal val functionName = JTextField()
    private val functionDescription = JTextField()
    private val createIamRoleButton = JButton("Create")
    internal val s3BucketPicker = ComboBox<Bucket>()
    private val createS3Bucket = JButton("Create")

    init {
        add(JLabel("Name:"), constraint(0, 0))
        add(functionName, constraint(1, 0, width = 3))
        add(JLabel("Description:"), constraint(0, 1))
        add(functionDescription, constraint(1, 1, width = 3))

        add(JSeparator(SwingConstants.HORIZONTAL), constraint(0, 3, width = 4))

        add(JLabel("Handler:"), constraint(0, 4))
        handlerPicker.isEnabled = false
        add(handlerPicker, constraint(1, 4, width = 3))

        add(JLabel("IAM Role:"), constraint(0, 5))
        iamRolePicker.isEnabled = false
        add(iamRolePicker, constraint(1, 5, width = 2))

        add(createIamRoleButton, constraint(3, 5, width = 1, fillHorizontal = false, alignLeft = false))
        createIamRoleButton.addActionListener { eventHandler.createIamRoleClicked(this) }

        add(JSeparator(SwingConstants.HORIZONTAL), constraint(0, 6, width = 4))

        add(JLabel("S3 Bucket:"), constraint(0, 7))
        s3BucketPicker.isEnabled = false
        add(s3BucketPicker, constraint(1, 7, width = 2))
        add(createS3Bucket, constraint(3, 7, width = 1, fillHorizontal = false, alignLeft = false))
        createS3Bucket.addActionListener { eventHandler.createS3BucketClicked(this) }
    }

    private fun constraint(
        x: Int,
        y: Int,
        width: Int = 1,
        fillHorizontal: Boolean = true,
        alignLeft: Boolean = true
    ): GridBagConstraints {
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

    fun enableHandlerPicker(enable: Boolean) {
        handlerPicker.isEnabled = enable
    }

    fun updateIamRoles(roles: List<IamRole>) = updatePicker(iamRolePicker, roles)

    fun enableIamRolesPicker(enable: Boolean) {
        iamRolePicker.isEnabled = enable
    }

    fun updateBuckets(buckets: List<Bucket>) = updatePicker(s3BucketPicker, buckets)

    fun enableBucketPicker(enable: Boolean) {
        s3BucketPicker.isEnabled = enable
    }

    internal fun handler(): String? = handlerPicker.selectedItem as String?
    internal fun iamRole(): IamRole? = iamRolePicker.selectedItem as IamRole?
    internal fun description(): String? = functionDescription.text
    internal fun functionName(): String? = functionName.text
    internal fun s3Bucket(): Bucket? = s3BucketPicker.selectedItem as Bucket?

    private fun <T> updatePicker(picker: JComboBox<T>, values: Iterable<T>) {
        val model = (picker.model as DefaultComboBoxModel<T>)
        model.removeAllElements()
        values.forEach { model.addElement(it) }
    }
}
