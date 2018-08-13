package software.aws.toolkits.jetbrains.services.lambda.local;

import com.intellij.json.JsonLanguage;
import com.intellij.openapi.components.ServiceManager;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.ui.ComboBox;
import com.intellij.ui.EditorTextField;
import com.intellij.ui.EditorTextFieldProvider;
import com.intellij.util.textCompletion.TextCompletionProvider;
import com.intellij.util.textCompletion.TextFieldWithCompletion;
import java.util.Collections;
import javax.swing.JPanel;
import software.amazon.awssdk.services.lambda.model.Runtime;
import software.aws.toolkits.jetbrains.ui.EnvironmentVariablesTextField;

public final class LocalLambdaRunSettingsEditorPanel {
    JPanel panel;
    EditorTextField handler;
    EditorTextField input;
    EnvironmentVariablesTextField environmentVariables;
    ComboBox<Runtime> runtime;
    private final Project project;
    private final TextCompletionProvider handlerCompletionProvider;

    public LocalLambdaRunSettingsEditorPanel(Project project, TextCompletionProvider handlerCompletionProvider) {
        this.project = project;
        this.handlerCompletionProvider = handlerCompletionProvider;
    }

    private void createUIComponents() {
        EditorTextFieldProvider textFieldProvider = ServiceManager.getService(project, EditorTextFieldProvider.class);
        input = textFieldProvider.getEditorField(JsonLanguage.INSTANCE, project, Collections.emptyList());
        handler = new TextFieldWithCompletion(project, handlerCompletionProvider, "", true, true, true, true);
    }
}
