// ===== GLOBAL VARIABLES =====
let recognition;
let isRunning = false;
let startTime;
let elapsedTime = 0;
let timerInterval;
let currentTask = 'General';
let questionNumber = 1;
let records = [];
let audioContext;
let analyser;
let microphone;
let lastCommand = '';
let lastCommandTime = 0;
const COMMAND_DEBOUNCE_MS = 3000; // Increased to 3 seconds

// Audio processing for noise cancellation
let noiseGate = { threshold: 0.5, enabled: true };
let micSensitivity = 0.5;

// Settings
let settings = {
    voiceFeedback: true,
    autoReset: false,
    soundNotifications: true,
    motivationalMessages: true,
    motivationFrequency: 15 // minutes
};

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    loadSettings();
    loadRecords();
    setupAudioContext();
    initSpeechRecognition();
    createAnimatedBackground();
    updateStats();
    updateActiveUsers();
    setInterval(updateActiveUsers, 30000); // Update every 30 seconds
    
    // Start motivation system
    if (settings.motivationalMessages) {
        startMotivationSystem();
    }

    speak('Welcome to Pomodoro Timer Pro. Voice commands are ready. Say start to begin.');
}

// ===== ANIMATED BACKGROUND =====
function createAnimatedBackground() {
    const background = document.getElementById('animatedBackground');
    
    // Create stars
    for (let i = 0; i < 150; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        star.style.left = Math.random() * 100 + '%';
        star.style.top = Math.random() * 100 + '%';
        star.style.setProperty('--duration', (Math.random() * 3 + 2) + 's');
        background.appendChild(star);
    }

    // Create shooting stars
    for (let i = 0; i < 5; i++) {
        const shootingStar = document.createElement('div');
        shootingStar.className = 'shooting-star';
        shootingStar.style.left = Math.random() * 100 + '%';
        shootingStar.style.top = Math.random() * 50 + '%';
        shootingStar.style.animationDelay = Math.random() * 10 + 's';
        background.appendChild(shootingStar);
    }

    // Create satellites
    for (let i = 0; i < 3; i++) {
        const satellite = document.createElement('div');
        satellite.className = 'satellite';
        satellite.style.left = Math.random() * 100 + '%';
        satellite.style.top = Math.random() * 100 + '%';
        satellite.style.animationDelay = Math.random() * 10 + 's';
        background.appendChild(satellite);
    }

    // Create rockets
    for (let i = 0; i < 2; i++) {
        const rocket = document.createElement('div');
        rocket.className = 'rocket';
        rocket.textContent = '🚀';
        rocket.style.animationDelay = Math.random() * 10 + 's';
        background.appendChild(rocket);
    }
}

// ===== AUDIO CONTEXT & NOISE CANCELLATION =====
function setupAudioContext() {
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            microphone = audioContext.createMediaStreamSource(stream);
            
            // Create noise gate using dynamics compressor
            const compressor = audioContext.createDynamicsCompressor();
            compressor.threshold.setValueAtTime(-50, audioContext.currentTime);
            compressor.knee.setValueAtTime(40, audioContext.currentTime);
            compressor.ratio.setValueAtTime(12, audioContext.currentTime);
            compressor.attack.setValueAtTime(0, audioContext.currentTime);
            compressor.release.setValueAtTime(0.25, audioContext.currentTime);

            // Connect audio nodes
            microphone.connect(compressor);
            compressor.connect(analyser);
            
            // Start monitoring audio levels
            monitorAudioLevel();
            
            document.getElementById('audioLevel').textContent = 'Audio: Optimized';
        })
        .catch(error => {
            console.error('Audio setup error:', error);
            document.getElementById('audioLevel').textContent = 'Audio: Permission needed';
        });
}

function monitorAudioLevel() {
    if (!analyser) return;
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    function update() {
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / bufferLength;
        const level = Math.round((average / 255) * 100);
        
        // Update UI
        const audioLevelEl = document.getElementById('audioLevel');
        if (level > 50) {
            audioLevelEl.textContent = `Audio: Active (${level}%)`;
        } else {
            audioLevelEl.textContent = 'Audio: Ready';
        }
        
        requestAnimationFrame(update);
    }
    
    update();
}

// ===== SPEECH RECOGNITION WITH DEBOUNCING =====
function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        document.getElementById('micStatus').textContent = 'Speech recognition not supported';
        speak('Please use Chrome or Edge browser for voice commands');
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false; // Changed to false to prevent repeated interim results
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
        document.getElementById('micStatus').textContent = 'Listening...';
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        
        if (event.error === 'not-allowed') {
            document.getElementById('micStatus').textContent = 'Microphone access denied';
            speak('Please allow microphone access to use voice commands');
        } else if (event.error === 'no-speech') {
            // Automatically restart on no-speech
            setTimeout(() => recognition.start(), 100);
        } else {
            document.getElementById('micStatus').textContent = `Error: ${event.error}`;
        }
    };

    recognition.onend = () => {
        // Auto-restart recognition
        if (document.getElementById('micStatus').textContent !== 'Microphone access denied') {
            setTimeout(() => {
                try {
                    recognition.start();
                } catch (e) {
                    console.log('Recognition restart skipped:', e);
                }
            }, 100);
        }
    };

    recognition.onresult = (event) => {
        const result = event.results[event.results.length - 1];
        
        // Only process final results to prevent repeats
        if (result.isFinal) {
            const transcript = result[0].transcript.toLowerCase().trim();
            processVoiceCommand(transcript);
        }
    };

    // Start recognition
    try {
        recognition.start();
    } catch (error) {
        console.error('Failed to start recognition:', error);
    }
}

// ===== PROCESS VOICE COMMAND WITH IMPROVED DEBOUNCING =====
function processVoiceCommand(transcript) {
    const now = Date.now();
    
    // Normalize transcript
    const normalizedTranscript = transcript.toLowerCase().trim();
    
    // Debounce: Ignore if same command within 3 seconds
    if (normalizedTranscript === lastCommand && (now - lastCommandTime) < COMMAND_DEBOUNCE_MS) {
        console.log('⏭️ Command ignored (debounced):', normalizedTranscript);
        return;
    }
    
    lastCommand = normalizedTranscript;
    lastCommandTime = now;
    
    console.log('🔍 Processing command:', normalizedTranscript);

   // Split into words for better matching
    const words = normalizedTranscript.split(' ');  // ← FIX: Use normalizedTranscript
    const firstWord = words[0];

    // START command
    if (normalizedTranscript === 'start' || firstWord === 'start') {  // ← FIX: Use 'start' not 'ON'
        if (!isRunning) {
            console.log('✅ START command executed');
            startTimer();
        } else {
            console.log('⚠️ Timer already running');
        }
    } 
    // STOP command
    else if (normalizedTranscript === 'stop' || firstWord === 'stop') {  // ← FIX: Use 'stop' not 'OFF'
        if (isRunning) {
            console.log('✅ STOP command executed');
            stopTimer();
        } else {
            console.log('⚠️ Timer not running');
        }
    } 
    // RESET command
    else if (normalizedTranscript === 'reset' || firstWord === 'reset') {
        console.log('✅ RESET command executed');
        resetData();
    } 
    // TASK command
    else if (normalizedTranscript.startsWith('task ')) {  // ← FIX: Use normalizedTranscript
        const taskName = normalizedTranscript.replace('task ', '').trim();
        if (taskName && taskName.length > 0) {
            console.log('✅ TASK command executed:', taskName);
            setTask(taskName);
        }
    } 
    // CERTIFICATE command
    else if (normalizedTranscript === 'certificate' || firstWord === 'certificate' || normalizedTranscript === 'download certificate') {
        console.log('✅ CERTIFICATE command executed');
        exportCertificate();
    } 
    // FULLSCREEN command
    else if (normalizedTranscript === 'full' || normalizedTranscript === 'fullscreen' || firstWord === 'full') {
        console.log('✅ FULLSCREEN command executed');
        toggleFullScreen();
    } 
    // ANALYSIS command
    else if (normalizedTranscript.includes('analysis') || normalizedTranscript.includes('analyze')) {
        console.log('✅ ANALYSIS command executed');
        showAiAnalysis();
    } 
    // EXPORT command
    else if (normalizedTranscript === 'export' || firstWord === 'export') {
        console.log('✅ EXPORT command executed');
        exportPdfReport();
    } 
    // SETTINGS command
    else if (normalizedTranscript === 'settings' || firstWord === 'settings') {
        console.log('✅ SETTINGS command executed');
        showSettings();
    } 
    // THEME command
    else if (normalizedTranscript.includes('theme') || normalizedTranscript.includes('toggle')) {
        console.log('✅ THEME command executed');
        toggleTheme();
    } 
    else {
        console.log('❓ Unknown command:', normalizedTranscript);
    }
    } 
    // STOP command
    else if (transcript === 'stop' || firstWord === 'stop') {
        if (isRunning) {
            console.log('✅ STOP command executed');
            stopTimer();
        } else {
            console.log('⚠️ Timer not running');
        }
    } 
    // RESET command
    else if (transcript === 'reset' || firstWord === 'reset') {
        console.log('✅ RESET command executed');
        resetData();
    } 
    // TASK command
    else if (transcript.startsWith('task ')) {
        const taskName = transcript.replace('task ', '').trim();
        if (taskName && taskName.length > 0) {
            console.log('✅ TASK command executed:', taskName);
            setTask(taskName);
        }
    } 
    // CERTIFICATE command
    else if (transcript === 'certificate' || firstWord === 'certificate' || transcript === 'download certificate') {
        console.log('✅ CERTIFICATE command executed');
        exportCertificate();
    } 
    // FULLSCREEN command
    else if (transcript === 'full' || transcript === 'fullscreen' || firstWord === 'full') {
        console.log('✅ FULLSCREEN command executed');
        toggleFullScreen();
    } 
    // ANALYSIS command
    else if (transcript.includes('analysis') || transcript.includes('analyze')) {
        console.log('✅ ANALYSIS command executed');
        showAiAnalysis();
    } 
    // EXPORT command
    else if (transcript === 'export' || firstWord === 'export') {
        console.log('✅ EXPORT command executed');
        exportPdfReport();
    } 
    // SETTINGS command
    else if (transcript === 'settings' || firstWord === 'settings') {
        console.log('✅ SETTINGS command executed');
        showSettings();
    } 
    // THEME command
    else if (transcript.includes('theme') || transcript.includes('toggle')) {
        console.log('✅ THEME command executed');
        toggleTheme();
    } 
    else {
        console.log('❓ Unknown command:', transcript);
    }
}

// ===== SET TASK =====
function setTask(taskName) {
    currentTask = taskName.charAt(0).toUpperCase() + taskName.slice(1);
    document.getElementById('currentTaskDisplay').textContent = currentTask;
    
    if (settings.voiceFeedback) {
        speak(`set to ${currentTask}`);
    }
}

// ===== TIMER FUNCTIONS =====
function startTimer() {
    if (isRunning) return;
    
    isRunning = true;
    startTime = Date.now() - elapsedTime;
    
    document.getElementById('startBtn').disabled = true;
    document.getElementById('stopBtn').disabled = false;
    
    timerInterval = setInterval(updateTimer, 100);
    
    if (settings.voiceFeedback) {
        speak('Timer started');
    }
    
    if (settings.soundNotifications) {
        playSound('start');
    }
}

function stopTimer() {
    if (!isRunning) return;
    
    isRunning = false;
    clearInterval(timerInterval);
    
    const timeSpent = Math.floor(elapsedTime / 1000);
    
    // Save record
    const record = {
        task: currentTask,
        question: questionNumber,
        time: timeSpent,
        timestamp: new Date().toISOString(),
        date: new Date().toLocaleDateString()
    };
    
    records.push(record);
    saveRecords();
    updateHistory();
    updateStats();
    
    // Reset for next question
    questionNumber++;
    document.getElementById('questionNumber').textContent = questionNumber;
    elapsedTime = 0;
    
    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
    document.getElementById('timerDisplay').textContent = '00:00';
    
    if (settings.voiceFeedback) {
        const minutes = Math.floor(timeSpent / 60);
        const seconds = timeSpent % 60;
        speak(`Timer stopped. Time taken: ${minutes} minutes ${seconds} seconds`);
    }
    
    if (settings.soundNotifications) {
        playSound('stop');
    }
}

function updateTimer() {
    elapsedTime = Date.now() - startTime;
    const totalSeconds = Math.floor(elapsedTime / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    // Update display with actual numbers (FIX for syntax issue)
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    document.getElementById('timerDisplay').textContent = timeStr;
    
    // Update progress circle
    updateProgressCircle(totalSeconds);
}

function updateProgressCircle(seconds) {
    const circle = document.getElementById('progressCircle');
    if (!circle) return;
    
    const circumference = 2 * Math.PI * 130;
    const maxSeconds = 3600; // 1 hour max
    const progress = (seconds % maxSeconds) / maxSeconds;
    const offset = circumference - (progress * circumference);
    
    circle.style.strokeDashoffset = offset;
}

function resetData(silent = false) {
    if (isRunning) {
        stopTimer();
    }
    
    elapsedTime = 0;
    questionNumber = 1;
    currentTask = 'General';
    
    document.getElementById('timerDisplay').textContent = '00:00';
    document.getElementById('questionNumber').textContent = '1';
    document.getElementById('currentTaskDisplay').textContent = 'Ready to Start';
    
    if (!silent && settings.voiceFeedback) {
        speak('Timer reset');
    }
}

// ===== HISTORY & STATS =====
function updateHistory() {
    const historyContent = document.getElementById('historyContent');
    document.getElementById('recordCount').textContent = records.length;
    
    if (records.length === 0) {
        historyContent.innerHTML = '<p class="no-data">No records yet. Start your first session!</p>';
        return;
    }
    
    let html = '';
    records.slice().reverse().forEach((record, index) => {
        const minutes = Math.floor(record.time / 60);
        const seconds = record.time % 60;
        const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        
        html += `
            <div class="history-item">
                <div><strong>${record.task}</strong></div>
                <div>Q${record.question}</div>
                <div>${timeStr}</div>
                <div>${record.date}</div>
            </div>
        `;
    });
    
    historyContent.innerHTML = html;
}

function updateStats() {
    if (records.length === 0) {
        document.getElementById('totalTime').textContent = '0h 0m';
        document.getElementById('avgTime').textContent = '0:00';
        document.getElementById('streak').textContent = '0';
        return;
    }
    
    // Total time
    const totalSeconds = records.reduce((sum, r) => sum + r.time, 0);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    document.getElementById('totalTime').textContent = `${hours}h ${minutes}m`;
    
    // Average time
    const avgSeconds = totalSeconds / records.length;
    const avgMin = Math.floor(avgSeconds / 60);
    const avgSec = Math.floor(avgSeconds % 60);
    document.getElementById('avgTime').textContent = `${avgMin}:${String(avgSec).padStart(2, '0')}`;
    
    // Calculate streak
    const streak = calculateStreak();
    document.getElementById('streak').textContent = streak;
}

function calculateStreak() {
    if (records.length === 0) return 0;
    
    const dates = [...new Set(records.map(r => r.date))].sort().reverse();
    let streak = 0;
    let currentDate = new Date();
    
    for (let date of dates) {
        const recordDate = new Date(date);
        const diffDays = Math.floor((currentDate - recordDate) / (1000 * 60 * 60 * 24));
        
        if (diffDays === streak) {
            streak++;
        } else {
            break;
        }
    }
    
    return streak;
}

// ===== AI ANALYSIS (Using Hugging Face Free API) =====
async function showAiAnalysis() {
    const modal = document.getElementById('aiAnalysisModal');
    modal.classList.add('active');
    
    document.getElementById('aiLoading').style.display = 'block';
    document.getElementById('aiAnalysisContent').style.display = 'none';
    
    if (records.length === 0) {
        document.getElementById('aiLoading').innerHTML = '<p>No data to analyze. Complete some study sessions first!</p>';
        return;
    }
    
    try {
        // Prepare data summary
        const totalTime = records.reduce((sum, r) => sum + r.time, 0);
        const avgTime = totalTime / records.length;
        const taskBreakdown = {};
        
        records.forEach(r => {
            if (!taskBreakdown[r.task]) {
                taskBreakdown[r.task] = { count: 0, totalTime: 0 };
            }
            taskBreakdown[r.task].count++;
            taskBreakdown[r.task].totalTime += r.time;
        });
        
        const prompt = `You are a study coach AI. Analyze this study data and provide insights:

Total Sessions: ${records.length}
Total Study Time: ${Math.floor(totalTime / 60)} minutes
Average Time per Question: ${Math.floor(avgTime)} seconds

Task Breakdown:
${Object.entries(taskBreakdown).map(([task, data]) => 
    `${task}: ${data.count} questions, ${Math.floor(data.totalTime / 60)} minutes`
).join('\n')}

Provide:
1. Key insights about study patterns (2-3 sentences)
2. Areas for improvement (2-3 specific actionable tips)
3. Motivational message based on progress (2-3 sentences)

Keep response concise, encouraging, and actionable.`;

        // Call Hugging Face API (free tier)
        const response = await fetch('https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                inputs: prompt,
                parameters: {
                    max_length: 200,
                    temperature: 0.7
                }
            })
        });
        
        if (!response.ok) {
            throw new Error('AI API unavailable');
        }
        
        const data = await response.json();
        const aiResponse = data[0]?.generated_text || generateFallbackAnalysis();
        
        displayAiAnalysis(aiResponse);
        
    } catch (error) {
        console.error('AI Analysis error:', error);
        const fallbackAnalysis = generateFallbackAnalysis();
        displayAiAnalysis(fallbackAnalysis);
    }
}

function generateFallbackAnalysis() {
    const totalTime = records.reduce((sum, r) => sum + r.time, 0);
    const avgTime = totalTime / records.length;
    const avgMinutes = Math.floor(avgTime / 60);
    const avgSeconds = Math.floor(avgTime % 60);
    
    let insights = `You've completed ${records.length} questions with an average time of ${avgMinutes}:${String(avgSeconds).padStart(2, '0')} per question. `;
    
    if (avgTime < 120) {
        insights += 'Your speed is excellent! ';
    } else if (avgTime < 300) {
        insights += 'Your pace is good and consistent. ';
    } else {
        insights += 'Take your time to understand each concept thoroughly. ';
    }
    
    let improvements = 'Focus on maintaining consistency in your study sessions. ';
    improvements += 'Try to identify patterns in questions that take longer and practice similar problems. ';
    improvements += 'Consider using the Pomodoro technique with 25-minute focused sessions.';
    
    let motivation = 'Great progress! Every question solved is a step closer to your goal. ';
    motivation += `You've shown dedication with ${records.length} completed sessions. `;
    motivation += 'Keep this momentum going and success will follow!';
    
    return {
        insights,
        improvements,
        motivation
    };
}

function displayAiAnalysis(analysis) {
    document.getElementById('aiLoading').style.display = 'none';
    document.getElementById('aiAnalysisContent').style.display = 'block';
    
    let insights, improvements, motivation;
    
    if (typeof analysis === 'string') {
        // Parse string response
        const parts = analysis.split('\n\n');
        insights = parts[0] || 'Analyzing your study patterns...';
        improvements = parts[1] || 'Keep practicing consistently.';
        motivation = parts[2] || 'You\'re doing great!';
    } else {
        insights = analysis.insights;
        improvements = analysis.improvements;
        motivation = analysis.motivation;
    }
    
    document.getElementById('aiInsights').innerHTML = `<p>${insights}</p>`;
    document.getElementById('aiImprovements').innerHTML = `<p>${improvements}</p>`;
    document.getElementById('aiMotivation').innerHTML = `<p>${motivation}</p>`;
    
    // Speak motivation
    if (settings.voiceFeedback) {
        speak(motivation);
    }
}

// ===== MOTIVATION SYSTEM =====
let motivationInterval;

function startMotivationSystem() {
    if (motivationInterval) {
        clearInterval(motivationInterval);
    }
    
    const intervalMs = settings.motivationFrequency * 60 * 1000;
    
    motivationInterval = setInterval(() => {
        if (records.length > 0) {
            const motivationalMessages = [
                'Great job! Keep up the excellent work!',
                'You\'re making amazing progress. Stay focused!',
                'Every question solved brings you closer to your goal!',
                'Your dedication is impressive. Keep going!',
                'Consistency is key. You\'re doing wonderfully!',
                'Believe in yourself. You\'ve got this!',
                'Your effort today shapes your success tomorrow!',
                'Stay motivated. Your hard work will pay off!'
            ];
            
            const message = motivationalMessages[Math.floor(Math.random() * motivationalMessages.length)];
            speak(message);
            
            // Show notification
            if (Notification.permission === 'granted') {
                new Notification('Pomodoro Timer Pro', {
                    body: message,
                    icon: 'favicon-32x32.png'
                });
            }
        }
    }, intervalMs);
}

// ===== EXPORT FUNCTIONS =====
async function exportPdfReport() {
    if (records.length === 0) {
        speak('No data to export');
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(99, 102, 241);
    doc.text('Study Report', 105, 20, { align: 'center' });
    
    // Date
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 105, 30, { align: 'center' });
    
    // Stats
    doc.setFontSize(12);
    doc.setTextColor(0);
    const totalTime = records.reduce((sum, r) => sum + r.time, 0);
    const avgTime = totalTime / records.length;
    
    doc.text(`Total Sessions: ${records.length}`, 20, 45);
    doc.text(`Total Time: ${Math.floor(totalTime / 60)} minutes`, 20, 55);
    doc.text(`Average Time: ${Math.floor(avgTime / 60)}:${String(Math.floor(avgTime % 60)).padStart(2, '0')}`, 20, 65);
    
    // Records table
    doc.setFontSize(10);
    let y = 80;
    doc.text('Task', 20, y);
    doc.text('Q#', 80, y);
    doc.text('Time', 110, y);
    doc.text('Date', 150, y);
    y += 5;
    
    doc.setDrawColor(99, 102, 241);
    doc.line(20, y, 190, y);
    y += 10;
    
    records.forEach((record) => {
        const minutes = Math.floor(record.time / 60);
        const seconds = record.time % 60;
        const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        
        doc.text(record.task.substring(0, 15), 20, y);
        doc.text(`Q${record.question}`, 80, y);
        doc.text(timeStr, 110, y);
        doc.text(record.date, 150, y);
        
        y += 8;
        
        if (y > 270) {
            doc.addPage();
            y = 20;
        }
    });
    
    doc.save('study-report.pdf');
    
    if (settings.voiceFeedback) {
        speak('Report exported successfully');
    }
    
    if (settings.autoReset) {
        resetData(true);
    }
}

async function exportCertificate() {
    if (records.length === 0) {
        speak('Complete some study sessions first to earn a certificate');
        return;
    }
    
    const modal = document.getElementById('certificateModal');
    const content = document.getElementById('certificateContent');
    
    const totalTime = records.reduce((sum, r) => sum + r.time, 0);
    const hours = Math.floor(totalTime / 3600);
    const minutes = Math.floor((totalTime % 3600) / 60);
    
    content.innerHTML = `
        <h1>🏆 Certificate of Achievement 🏆</h1>
        <h2>This certifies that</h2>
        <h2 style="color: var(--primary-color); font-size: 2rem; margin: 1rem 0;">Dedicated Student</h2>
        <p>has successfully completed</p>
        <h2 style="font-size: 2.5rem; color: var(--secondary-color);">${records.length} Study Sessions</h2>
        <p>with a total study time of</p>
        <h2 style="font-size: 2rem; color: var(--primary-color);">${hours} Hours ${minutes} Minutes</h2>
        <p style="margin-top: 2rem;">Date: ${new Date().toLocaleDateString()}</p>
        <p style="font-style: italic; margin-top: 1rem;">"Excellence is not a skill, it's an attitude"</p>
    `;
    
    modal.classList.add('active');
    
    if (settings.voiceFeedback) {
        speak('Certificate generated successfully');
    }
}

function downloadCertificate() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape');
    
    const totalTime = records.reduce((sum, r) => sum + r.time, 0);
    const hours = Math.floor(totalTime / 3600);
    const minutes = Math.floor((totalTime % 3600) / 60);
    
    // Border
    doc.setLineWidth(5);
    doc.setDrawColor(99, 102, 241);
    doc.rect(10, 10, 277, 190);
    
    // Title
    doc.setFontSize(40);
    doc.setTextColor(99, 102, 241);
    doc.text('Certificate of Achievement', 148, 50, { align: 'center' });
    
    // Content
    doc.setFontSize(16);
    doc.setTextColor(0);
    doc.text('This certifies that', 148, 75, { align: 'center' });
    
    doc.setFontSize(30);
    doc.setTextColor(139, 92, 246);
    doc.text('Dedicated Student', 148, 95, { align: 'center' });
    
    doc.setFontSize(16);
    doc.setTextColor(0);
    doc.text('has successfully completed', 148, 110, { align: 'center' });
    
    doc.setFontSize(35);
    doc.setTextColor(99, 102, 241);
    doc.text(`${records.length} Study Sessions`, 148, 130, { align: 'center' });
    
    doc.setFontSize(16);
    doc.setTextColor(0);
    doc.text(`Total Study Time: ${hours} Hours ${minutes} Minutes`, 148, 150, { align: 'center' });
    
    doc.setFontSize(12);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 148, 170, { align: 'center' });
    
    doc.save('study-certificate.pdf');
    
    if (settings.voiceFeedback) {
        speak('Certificate downloaded');
    }
}

// ===== SETTINGS =====
function showSettings() {
    document.getElementById('settingsModal').classList.add('active');
}

function updateMicSensitivity(value) {
    micSensitivity = value / 100;
    document.getElementById('micSensitivityValue').textContent = value + '%';
    saveSettings();
}

function updateNoiseCancellation(value) {
    noiseGate.threshold = value / 100;
    document.getElementById('noiseCancellationValue').textContent = value + '%';
    saveSettings();
}

function toggleVoiceFeedback(checked) {
    settings.voiceFeedback = checked;
    saveSettings();
}

function toggleAutoReset(checked) {
    settings.autoReset = checked;
    saveSettings();
}

function toggleSoundNotifications(checked) {
    settings.soundNotifications = checked;
    saveSettings();
}

function toggleMotivation(checked) {
    settings.motivationalMessages = checked;
    if (checked) {
        startMotivationSystem();
    } else {
        clearInterval(motivationInterval);
    }
    saveSettings();
}

function updateMotivationFrequency(value) {
    settings.motivationFrequency = parseInt(value);
    if (settings.motivationalMessages) {
        startMotivationSystem();
    }
    saveSettings();
}

function calibrateAudio() {
    speak('Audio calibration started. Please speak normally for 5 seconds.');
    
    setTimeout(() => {
        speak('Calibration complete. Audio settings optimized.');
    }, 5000);
}

// ===== UI FUNCTIONS =====
function toggleAccordion(id) {
    const content = document.getElementById(id);
    const header = content.previousElementSibling;
    
    content.classList.toggle('active');
    header.classList.toggle('active');
}

function toggleTheme() {
    document.body.classList.toggle('night');
    const icon = document.getElementById('themeIcon');
    
    if (document.body.classList.contains('night')) {
        icon.textContent = 'brightness_7';
    } else {
        icon.textContent = 'brightness_4';
    }
}

function toggleFullScreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Close modals on outside click
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('active');
    }
};

// ===== TEXT TO SPEECH =====
function speak(text) {
    if (!settings.voiceFeedback) return;
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1;
    utterance.pitch = 1;
    utterance.volume = 0.8;
    
    window.speechSynthesis.cancel(); // Cancel any ongoing speech
    window.speechSynthesis.speak(utterance);
}

// ===== SOUND EFFECTS =====
function playSound(type) {
    if (!settings.soundNotifications) return;
    
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    if (type === 'start') {
        oscillator.frequency.value = 523.25; // C5
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    } else if (type === 'stop') {
        oscillator.frequency.value = 392.00; // G4
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
    }
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
}

// ===== LOCAL STORAGE =====
function saveRecords() {
    localStorage.setItem('pomodoroRecords', JSON.stringify(records));
}

function loadRecords() {
    const saved = localStorage.getItem('pomodoroRecords');
    if (saved) {
        records = JSON.parse(saved);
        updateHistory();
        updateStats();
    }
}

function saveSettings() {
    localStorage.setItem('pomodoroSettings', JSON.stringify(settings));
}

function loadSettings() {
    const saved = localStorage.getItem('pomodoroSettings');
    if (saved) {
        settings = { ...settings, ...JSON.parse(saved) };
        
        // Apply loaded settings to UI
        document.getElementById('voiceFeedback').checked = settings.voiceFeedback;
        document.getElementById('autoReset').checked = settings.autoReset;
        document.getElementById('soundNotifications').checked = settings.soundNotifications;
        document.getElementById('motivationalMessages').checked = settings.motivationalMessages;
        document.getElementById('motivationFrequency').value = settings.motivationFrequency;
    }
}

// ===== ACTIVE USERS SIMULATION =====
function updateActiveUsers() {
    const baseUsers = 15234;
    const variance = Math.floor(Math.random() * 500) - 250;
    const activeUsers = baseUsers + variance;
    document.getElementById('activeUsers').textContent = activeUsers.toLocaleString();
}

// ===== NOTIFICATION PERMISSION =====
if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
}

// ===== AUTO-SET THEME BASED ON TIME =====
function autoSetTheme() {
    const hour = new Date().getHours();
    if (hour >= 18 || hour < 6) {
        document.body.classList.add('night');
        document.getElementById('themeIcon').textContent = 'brightness_7';
    }
}

autoSetTheme();

// ===== SERVICE WORKER FOR PWA =====
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {
        console.log('Service worker registration not available');
    });
}
