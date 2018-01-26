package software.aws.toolkits.jetbrains.ui.credentials;

import com.amazonaws.auth.profile.internal.BasicProfile;
import com.amazonaws.auth.profile.internal.ProfileKeyConstants;
import com.intellij.ui.components.JBPasswordField;
import com.intellij.ui.components.JBTextField;
import java.util.HashMap;
import java.util.Map;
import javax.swing.JComponent;
import javax.swing.JPanel;
import org.jetbrains.annotations.NotNull;
import software.aws.toolkits.jetbrains.credentials.CredentialFileBasedProfile;
import software.aws.toolkits.jetbrains.credentials.ProfileEditor;

public class CredentialFileBasedProfileEditor extends ProfileEditor<CredentialFileBasedProfile> {
    private JPanel component;
    private JBTextField accessKeyInput;
    private JBPasswordField secretKeyInput;

    public CredentialFileBasedProfileEditor() {
        this("", "", "");
    }

    public CredentialFileBasedProfileEditor(CredentialFileBasedProfile source) {
        this(source.getName(), source.getProfile().getAwsAccessIdKey(), source.getProfile().getAwsSecretAccessKey());
    }

    private CredentialFileBasedProfileEditor(String name, String accessKey, String secretKey) {
        super(name);
        this.accessKeyInput.setText(accessKey);
        this.secretKeyInput.setText(secretKey);
        this.secretKeyInput.setPasswordIsStored(secretKey.length() > 0);
    }

    @NotNull
    @Override
    public JComponent getEditorComponent() {
        return component;
    }

    @NotNull
    @Override
    public CredentialFileBasedProfile commit() {
        // TODO: Stop using internal APIs, https://github.com/aws/aws-sdk-java-v2/issues/70
        Map<String, String> properties = new HashMap<>();
        properties.put(ProfileKeyConstants.AWS_ACCESS_KEY_ID, accessKeyInput.getText());
        properties.put(ProfileKeyConstants.AWS_SECRET_ACCESS_KEY, new String(secretKeyInput.getPassword()));

        BasicProfile profile = new BasicProfile(getProfileNameEditor().getValue(), properties);
        return new CredentialFileBasedProfile(profile);
    }
}
