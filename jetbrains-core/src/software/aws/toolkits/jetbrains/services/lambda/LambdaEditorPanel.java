package software.aws.toolkits.jetbrains.services.lambda;

import com.intellij.json.JsonLanguage;
import com.intellij.openapi.components.ServiceManager;
import com.intellij.openapi.editor.ex.EditorEx;
import com.intellij.openapi.project.Project;
import com.intellij.ui.EditorCustomization;
import com.intellij.ui.EditorTextField;
import com.intellij.ui.EditorTextFieldProvider;
import java.util.Collections;
import javax.swing.JButton;
import javax.swing.JComboBox;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.JTextArea;
import javax.swing.JTextField;
import org.jetbrains.annotations.NotNull;

public final class LambdaEditorPanel {
    private final Project project;
    JTextField handler;
    JLabel title;
    JLabel lastModified;

    EditorTextField input;

    JPanel contentPanel;
    JTextField arn;
    JButton invoke;
    EditorTextField response;
    JTextArea logOutput;
    JComboBox exampleRequests;

    public LambdaEditorPanel(Project project) {
        this.project = project;
    }

    private void createUIComponents() {
        EditorTextFieldProvider textFieldProvider = ServiceManager.getService(project, EditorTextFieldProvider.class);
        input = textFieldProvider.getEditorField(JsonLanguage.INSTANCE, project, Collections.emptyList());
        response = textFieldProvider.getEditorField(JsonLanguage.INSTANCE, project, Collections.singletonList(new IsViewerCustomization()));
    }

    public void setBusy(Boolean busy) {
        input.setEnabled(!busy);
    }

    private class IsViewerCustomization implements EditorCustomization {
        @Override
        public void customize(@NotNull EditorEx editor) {
            editor.setViewer(true);
        }
    }
}
