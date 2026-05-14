const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Helper function to get file path
function getFilePath(fileName) {
  return path.join(DATA_DIR, `${fileName}.json`);
}

// Read data from JSON file
function readData(fileName, defaultValue = {}) {
  try {
    const filePath = getFilePath(fileName);
    if (!fs.existsSync(filePath)) {
      return defaultValue;
    }
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading ${fileName}.json:`, error.message);
    return defaultValue;
  }
}

// Write data to JSON file
function writeData(fileName, data) {
  try {
    const filePath = getFilePath(fileName);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error(`Error writing ${fileName}.json:`, error.message);
    return false;
  }
}

// Append data to array
function appendData(fileName, newData) {
  try {
    const filePath = getFilePath(fileName);
    let data = [];
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      data = JSON.parse(fileContent);
    }
    data.push(newData);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error(`Error appending to ${fileName}.json:`, error.message);
    return false;
  }
}

// Update data by ID
function updateData(fileName, id, updatedData) {
  try {
    const filePath = getFilePath(fileName);
    let data = readData(fileName, []);
    
    if (!Array.isArray(data)) {
      data = [data];
    }
    
    const index = data.findIndex(item => item.id === id);
    if (index !== -1) {
      data[index] = { ...data[index], ...updatedData };
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Error updating ${fileName}.json:`, error.message);
    return false;
  }
}

module.exports = {
  readData,
  writeData,
  appendData,
  updateData,
  getFilePath,
};
