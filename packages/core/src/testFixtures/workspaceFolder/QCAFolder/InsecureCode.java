import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.io.*;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;

public class InsecureCode {
    // Hardcoded credentials - security issue
    public static final String DB_PASSWORD = "fhasiufl7324kjs";
    public static final String API_KEY = "AIzaSyB4x9K2mW7_dJ6hN3pL5tR8";
    
    // Weak encryption key
    private static byte[] key = "weak1234".getBytes();
    
    public static void main(String[] args) {
        try {
            processUserData("admin");
        } catch (Exception e) {
            // Empty catch block - bad practice
        }
    }
    
    public static void processUserData(String input) throws Exception {
        // SQL Injection vulnerability
        Connection conn = DriverManager.getConnection("jdbc:mysql://localhost/db", "root", System.getenv("PASSWORD_VALUE"));
        Statement stmt = conn.createStatement();
        stmt.execute("SELECT * FROM users WHERE name = '" + input + "'");
        
        // Resource leak - not closing resources properly
        FileInputStream fis = new FileInputStream("data.txt");
        byte[] data = new byte[1024];
        fis.read(data);
        
        // Weak encryption algorithm
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        SecretKeySpec secretKey = new SecretKeySpec(key, "AES");
        cipher.init(Cipher.ENCRYPT_MODE, secretKey);
        
        // Potential information exposure
        System.out.println("Debug: API Key = " + API_KEY);
        
        // Infinite loop potential
        while(true) {
            if(Math.random() > 0.999) break;
        }
    }
    
    public static boolean validatePassword(String password) {
        // Hardcoded password comparison
        return password.equals("admin123");
    }
    
    public static void writeToFile(String input) {
        try {
            // Path traversal vulnerability
            FileWriter fw = new FileWriter("../" + input);
            fw.write("data");
            // Resource leak - not closing the FileWriter
        } catch (IOException e) {
            // Swallowing exception
        }
    }
    
    public static void executeCommand(String cmd) throws IOException {
        // Command injection vulnerability
        Runtime.getRuntime().exec(cmd);
    }
    
    private static class User {
        // Public fields - encapsulation violation
        public String username;
        public String password;
        
        // Non-final field in serializable class
        private static String secretKey;
    }
}
