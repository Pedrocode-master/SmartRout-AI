const API_URL = 'http://localhost:5000';

export async function testConnection() {
  console.log('Testing connection to:', API_URL);
  
  try {
    const response = await fetch(`${API_URL}/health`);
    console.log('Response status:', response.status);
    const data = await response.json();
    console.log('Response data:', data);
    return { success: true, data };
  } catch (error) {
    console.error('Connection failed:', error);
    return { success: false, error: error.message };
  }
}

// Auto-execute on import
testConnection();
