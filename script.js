/**
         * GESTION DU LOGO CENTRAL EL PATRÓN
         * Tente de charger "LOGO EL PATRON ROUGE.png" s'il est dans le même dossier,
         * et affiche par défaut le logo vectoriel haute fidélité EL PATRÓN.
         */
        const hubLogoImg = document.getElementById('hubLogoImg');
        const hubLogoSvg = document.getElementById('hubLogoSvg');
        const customLogoInput = document.getElementById('customLogoInput');

        hubLogoImg.addEventListener('load', () => {
            if (hubLogoImg.naturalWidth > 0) {
                hubLogoImg.classList.remove('hidden');
                hubLogoSvg.classList.add('hidden');
            }
        });

        hubLogoImg.addEventListener('error', () => {
            hubLogoImg.classList.add('hidden');
            hubLogoSvg.classList.remove('hidden');
        });

        // Permet à l'utilisateur de charger son fichier PNG local à tout moment
        customLogoInput.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                hubLogoImg.src = ev.target.result;
            };
            reader.readAsDataURL(file);
        });

        /**
         * RÉPARTITION ÉQUITABLE ET ALÉATOIRE DES 14 SEGMENTS
         * 4 lots gagnants répartis uniformément autour de la roue (espacés de 2 à 3 "Pas de chance")
         * avec ordre des lots mélangé aléatoirement et décalage de départ aléatoire.
         */
        const WINNING_PRIZES = [
            { label: "Un fresco", isWin: true, icon: "🥤", bg: "#059669", text: "#ffffff" },
            { label: "Une portion de frite", isWin: true, icon: "🍟", bg: "#d97706", text: "#ffffff" },
            { label: "Un demi poulet rôti", isWin: true, icon: "🍗", bg: "#C81D11", text: "#ffffff" },
            { label: "Un chawarma", isWin: true, icon: "🌯", bg: "#7c3aed", text: "#ffffff" }
        ];

        const LOSE_STYLES = [
            { label: "Pas de chance", isWin: false, icon: "🍀", bg: "#1c1917", text: "#e7e5e4" },
            { label: "Pas de chance", isWin: false, icon: "🎲", bg: "#292524", text: "#d6d3d1" }
        ];

        function shuffleArray(array) {
            const copy = [...array];
            for (let i = copy.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [copy[i], copy[j]] = [copy[j], copy[i]];
            }
            return copy;
        }

        function buildBalancedRandomSegments() {
            const totalSlots = 14;
            const shuffledPrizes = shuffleArray(WINNING_PRIZES);

            // Positions équidistantes sur 14 parts : espacements de 3, 4, 3, 4 parts (soit 2 ou 3 "Pas de chance" entre chaque gain)
            const baseWinPositions = [0, 3, 7, 10];
            const randomShift = Math.floor(Math.random() * totalSlots);
            const winSlotMap = new Map();

            baseWinPositions.forEach((pos, idx) => {
                const shiftedPos = (pos + randomShift) % totalSlots;
                winSlotMap.set(shiftedPos, shuffledPrizes[idx]);
            });

            const segments = [];
            let loseCounter = 0;
            for (let i = 0; i < totalSlots; i++) {
                if (winSlotMap.has(i)) {
                    segments.push(winSlotMap.get(i));
                } else {
                    const style = LOSE_STYLES[loseCounter % LOSE_STYLES.length];
                    segments.push({ ...style });
                    loseCounter++;
                }
            }
            return segments;
        }

        const SEGMENTS = buildBalancedRandomSegments();
        const NUM_SEGMENTS = SEGMENTS.length;
        const ARC_ANGLE = (2 * Math.PI) / NUM_SEGMENTS;

        // Références DOM
        const wheelContainer = document.getElementById('wheelContainer');
        const canvas = document.getElementById('wheelCanvas');
        const ctx = canvas.getContext('2d');
        const wheelPointer = document.getElementById('wheelPointer');
        const spinCenterBtn = document.getElementById('spinCenterBtn');
        const spinMainBtn = document.getElementById('spinMainBtn');
        const soundToggleBtn = document.getElementById('soundToggleBtn');
        const soundIcon = document.getElementById('soundIcon');
        const soundText = document.getElementById('soundText');

        // Modale
        const resultModal = document.getElementById('resultModal');
        const modalBannerGlow = document.getElementById('modalBannerGlow');
        const modalEmoji = document.getElementById('modalEmoji');
        const modalTitle = document.getElementById('modalTitle');
        const modalPrizeBox = document.getElementById('modalPrizeBox');
        const modalPrizeName = document.getElementById('modalPrizeName');
        const modalMessage = document.getElementById('modalMessage');
        const validationTicket = document.getElementById('validationTicket');
        const ticketCode = document.getElementById('ticketCode');
        const ticketTime = document.getElementById('ticketTime');
        const closeModalBtn = document.getElementById('closeModalBtn');

        // Historique
        const staffDrawerBtn = document.getElementById('staffDrawerBtn');
        const staffDrawerOverlay = document.getElementById('staffDrawerOverlay');
        const closeDrawerBtn = document.getElementById('closeDrawerBtn');
        const historyBadge = document.getElementById('historyBadge');
        const historyList = document.getElementById('historyList');
        const statTotalSpins = document.getElementById('statTotalSpins');
        const statTotalWins = document.getElementById('statTotalWins');
        const resetHistoryBtn = document.getElementById('resetHistoryBtn');
        const resetBtnLabel = document.getElementById('resetBtnLabel');

        // État
        let currentRotation = 0;
        let isSpinning = false;
        let soundEnabled = true;
        let audioCtx = null;
        let lastSegmentIndex = -1;
        let spinHistory = [];
        let resetConfirmTimeout = null;
        let resetArmed = false;
        let playerRegistered = false;

        try {
            const saved = localStorage.getItem('el_patron_wheel_history');
            if (saved) {
                spinHistory = JSON.parse(saved);
            }
        } catch (e) {}

        /**
         * MOTEUR AUDIO SYNTHÉTISÉ (WEB AUDIO API)
         */
        function initAudio() {
            if (!audioCtx) {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                if (AudioContextClass) {
                    audioCtx = new AudioContextClass();
                }
            }
            if (audioCtx && audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
        }

        function playTickSound() {
            if (!soundEnabled || !audioCtx) return;
            try {
                const now = audioCtx.currentTime;
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();

                osc.type = 'triangle';
                osc.frequency.setValueAtTime(640, now);
                osc.frequency.exponentialRampToValueAtTime(190, now + 0.045);

                gain.gain.setValueAtTime(0.18, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

                osc.connect(gain);
                gain.connect(audioCtx.destination);

                osc.start(now);
                osc.stop(now + 0.05);
            } catch (e) {}
        }

        function playWinSound() {
            if (!soundEnabled || !audioCtx) return;
            try {
                const now = audioCtx.currentTime;
                const notes = [523.25, 659.25, 783.99, 1046.50];
                notes.forEach((freq, idx) => {
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();

                    osc.type = 'sine';
                    const startTime = now + idx * 0.11;
                    osc.frequency.setValueAtTime(freq, startTime);

                    gain.gain.setValueAtTime(0.001, startTime);
                    gain.gain.linearRampToValueAtTime(0.25, startTime + 0.03);
                    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.45);

                    osc.connect(gain);
                    gain.connect(audioCtx.destination);

                    osc.start(startTime);
                    osc.stop(startTime + 0.48);
                });
            } catch (e) {}
        }

        function playLoseSound() {
            if (!soundEnabled || !audioCtx) return;
            try {
                const now = audioCtx.currentTime;
                const notes = [392.00, 329.63];
                notes.forEach((freq, idx) => {
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();

                    osc.type = 'sine';
                    const startTime = now + idx * 0.18;
                    osc.frequency.setValueAtTime(freq, startTime);

                    gain.gain.setValueAtTime(0.001, startTime);
                    gain.gain.linearRampToValueAtTime(0.16, startTime + 0.04);
                    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);

                    osc.connect(gain);
                    gain.connect(audioCtx.destination);

                    osc.start(startTime);
                    osc.stop(startTime + 0.38);
                });
            } catch (e) {}
        }

        /**
         * DESSIN DU CANVAS AVEC PROTECTION CONTRE LES DIMENSIONS NULLES (ResizeObserver)
         */
        function resizeAndDrawWheel() {
            const container = canvas.parentElement;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;

            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.round(rect.width * dpr);
            canvas.height = Math.round(rect.height * dpr);

            ctx.save();
            ctx.scale(dpr, dpr);
            drawWheel(rect.width, rect.height);
            ctx.restore();
        }

        function drawWheel(width, height) {
            if (width <= 0 || height <= 0) return;
            const centerX = width / 2;
            const centerY = height / 2;
            const radius = Math.max(10, Math.min(centerX, centerY) - 4);

            ctx.clearRect(0, 0, width, height);

            for (let i = 0; i < NUM_SEGMENTS; i++) {
                const seg = SEGMENTS[i];
                const startAngle = currentRotation + i * ARC_ANGLE - Math.PI / 2;
                const endAngle = startAngle + ARC_ANGLE;

                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.arc(centerX, centerY, radius, startAngle, endAngle);
                ctx.closePath();

                ctx.fillStyle = seg.bg;
                ctx.fill();

                ctx.lineWidth = 2;
                ctx.strokeStyle = seg.isWin ? "#fde047" : "rgba(255, 255, 255, 0.22)";
                ctx.stroke();

                // Libellé et icône dans chaque secteur
                ctx.save();
                ctx.translate(centerX, centerY);
                ctx.rotate(startAngle + ARC_ANGLE / 2);

                ctx.textAlign = "right";
                ctx.textBaseline = "middle";
                ctx.fillStyle = seg.text;

                const fontSize = Math.max(9.5, Math.min(14, width * 0.028));
                ctx.font = `${seg.isWin ? '800' : '600'} ${fontSize}px Outfit, sans-serif`;

                ctx.shadowColor = "rgba(0,0,0,0.7)";
                ctx.shadowBlur = 3;

                const textRadius = Math.max(12, radius - 14);
                ctx.fillText(`${seg.label} ${seg.icon}`, textRadius, 0);

                ctx.restore();
            }

            // Clous dorés sur le pourtour
            for (let i = 0; i < NUM_SEGMENTS; i++) {
                const pinAngle = currentRotation + i * ARC_ANGLE - Math.PI / 2;
                const pinRadius = Math.max(6, radius - 7);
                const pinX = centerX + Math.cos(pinAngle) * pinRadius;
                const pinY = centerY + Math.sin(pinAngle) * pinRadius;

                ctx.beginPath();
                ctx.arc(pinX, pinY, 3.5, 0, Math.PI * 2);
                ctx.fillStyle = "#fef08a";
                ctx.fill();
                ctx.lineWidth = 1;
                ctx.strokeStyle = "#78350f";
                ctx.stroke();
            }
        }

        function getCurrentSegmentIndex(rotationRad) {
            const normalized = ((rotationRad % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
            const index = Math.floor(((2 * Math.PI - normalized) % (2 * Math.PI)) / ARC_ANGLE);
            return index % NUM_SEGMENTS;
        }

        /**
         * ANIMATION PHYSIQUE DU TIRAGE
         */
        function spinWheel() {
            if (isSpinning) return;
            if (!playerRegistered) {
                document.getElementById("registrationGate")?.classList.remove("is-hidden");
                return;
            }

            initAudio();
            isSpinning = true;
            wheelContainer.classList.add('is-spinning');

            spinMainBtn.disabled = true;
            spinMainBtn.classList.add('opacity-60', 'cursor-not-allowed');
            spinCenterBtn.classList.remove('hub-pulse');

            const extraSpins = (6 + Math.random() * 3) * 2 * Math.PI;
            const randomOffset = Math.random() * 2 * Math.PI;
            const startRotation = currentRotation;
            const targetRotation = startRotation + extraSpins + randomOffset;

            const duration = 4800 + Math.random() * 1000;
            const startTime = performance.now();

            function easeOutQuint(t) {
                return 1 - Math.pow(1 - t, 5);
            }

            function animate(now) {
                const elapsed = now - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const easedProgress = easeOutQuint(progress);

                currentRotation = startRotation + (targetRotation - startRotation) * easedProgress;

                const activeIdx = getCurrentSegmentIndex(currentRotation);
                if (activeIdx !== lastSegmentIndex) {
                    lastSegmentIndex = activeIdx;
                    playTickSound();
                    triggerPointerBounce();
                }

                const rect = canvas.parentElement.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    const dpr = window.devicePixelRatio || 1;
                    ctx.save();
                    ctx.scale(dpr, dpr);
                    drawWheel(rect.width, rect.height);
                    ctx.restore();
                }

                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    finishSpin(activeIdx);
                }
            }

            requestAnimationFrame(animate);
        }

        function triggerPointerBounce() {
            wheelPointer.classList.remove('pointer-animate');
            void wheelPointer.offsetWidth;
            wheelPointer.classList.add('pointer-animate');
        }

        /**
         * AFFICHAGE DU RÉSULTAT & ENREGISTREMENT
         */
        async function finishSpin(winningIndex) {
            const segment = SEGMENTS[winningIndex];
            let persisted = false;
            let validationId = null;
            const now = new Date();
            let timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            // Le résultat est aussi enregistré sur le serveur avec le profil du participant.
            try {
                const response = await fetch('/api/spins', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ label: segment.label })
                });
                const payload = await response.json();
                if (!response.ok) throw new Error(payload.error || 'Enregistrement impossible.');
                persisted = true;
                validationId = payload.validationCode || null;
                if (payload.playedAt) {
                    timeStr = new Date(payload.playedAt).toLocaleTimeString('fr-FR', {
                        hour: '2-digit', minute: '2-digit', second: '2-digit'
                    });
                }
            } catch (error) {
                console.error('Historique serveur indisponible:', error);
            }

            isSpinning = false;
            wheelContainer.classList.remove('is-spinning');
            spinMainBtn.disabled = false;
            spinMainBtn.classList.remove('opacity-60', 'cursor-not-allowed');
            spinCenterBtn.classList.add('hub-pulse');

            recordHistory({
                label: segment.label,
                icon: segment.icon,
                isWin: segment.isWin,
                time: timeStr,
                code: validationId
            });

            if (segment.isWin) {
                playWinSound();
                launchConfetti();

                modalBannerGlow.className = "absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full bg-emerald-500/30 blur-3xl pointer-events-none";
                modalEmoji.textContent = segment.icon;
                modalEmoji.className = "w-20 h-20 mx-auto rounded-3xl bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center text-5xl mb-4 shadow-inner";
                modalTitle.textContent = persisted ? "Félicitations ! 🎉" : "Bravo !";
                modalTitle.className = "font-patron text-3xl sm:text-4xl font-bold text-emerald-300 uppercase tracking-wide mb-2";

                modalPrizeBox.className = "my-4 py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-500/20 via-amber-500/25 to-emerald-500/20 border border-emerald-400/50";
                modalPrizeName.textContent = segment.label;
                if (persisted && validationId) {
                    modalMessage.textContent = "Quel régal ! Présentez votre code à l'équipe EL PATRÓN pour valider votre cadeau.";
                    ticketCode.textContent = validationId;
                    ticketTime.textContent = timeStr;
                    validationTicket.classList.remove('hidden');
                } else {
                    modalMessage.textContent = "Votre gain doit être confirmé par l'équipe EL PATRÓN. La connexion n'a pas permis d'enregistrer le tirage : montrez cet écran au personnel.";
                    validationTicket.classList.add('hidden');
                }
            } else {
                playLoseSound();

                modalBannerGlow.className = "absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full bg-[#C81D11]/25 blur-3xl pointer-events-none";
                modalEmoji.textContent = "😊";
                modalEmoji.className = "w-20 h-20 mx-auto rounded-3xl bg-white/10 border border-white/20 flex items-center justify-center text-5xl mb-4 shadow-inner";
                modalTitle.textContent = "Pas de chance !";
                modalTitle.className = "font-patron text-3xl sm:text-4xl font-bold text-amber-200 uppercase tracking-wide mb-2";

                modalPrizeBox.className = "my-4 py-3.5 px-4 rounded-2xl bg-white/5 border border-white/15";
                modalPrizeName.textContent = "Pas de chance cette fois";
                modalMessage.textContent = persisted
                    ? "Toute l'équipe EL PATRÓN vous souhaite un excellent appétit et vous invite à retenter votre chance lors de votre prochaine visite !"
                    : "Le résultat n'a pas pu être ajouté à l'historique. Merci d'en informer l'équipe EL PATRÓN.";
                validationTicket.classList.add('hidden');
            }

            resultModal.classList.remove('hidden');
            resultModal.classList.add('flex');
        }

                function launchConfetti() {
            if (typeof confetti === 'function') {
                confetti({
                    particleCount: 95,
                    spread: 75,
                    origin: { y: 0.6 },
                    colors: ['#C81D11', '#fbbf24', '#10b981', '#ffffff']
                });
                setTimeout(() => {
                    confetti({ particleCount: 50, angle: 60, spread: 55, origin: { x: 0 } });
                    confetti({ particleCount: 50, angle: 120, spread: 55, origin: { x: 1 } });
                }, 250);
            }
        }

        /**
         * HISTORIQUE & STATISTIQUES DU PERSONNEL
         */
        function recordHistory(entry) {
            spinHistory.unshift(entry);
            if (spinHistory.length > 50) {
                spinHistory.pop();
            }
            try {
                localStorage.setItem('el_patron_wheel_history', JSON.stringify(spinHistory));
            } catch (e) {}
            renderHistory();
        }

        function renderHistory() {
            const total = spinHistory.length;
            const wins = spinHistory.filter(item => item.isWin).length;

            historyBadge.textContent = total;
            statTotalSpins.textContent = total;
            statTotalWins.textContent = wins;

            if (total === 0) {
                historyList.innerHTML = `
                    <div class="text-center text-neutral-500 text-sm py-12">
                        Aucun tirage effectué pour le moment.
                    </div>
                `;
                return;
            }

            historyList.innerHTML = spinHistory.map(item => `
                <div class="p-3 rounded-2xl ${item.isWin ? 'bg-emerald-500/15 border border-emerald-500/35' : 'bg-white/5 border border-white/10'} flex items-center justify-between gap-3">
                    <div class="flex items-center gap-3">
                        <span class="text-2xl">${item.icon}</span>
                        <div>
                            <p class="text-sm font-bold ${item.isWin ? 'text-emerald-300' : 'text-neutral-300'}">${item.label}</p>
                            <p class="text-xs text-neutral-400">${item.time} ${item.code ? `• <span class="font-mono text-amber-400">${item.code}</span>` : ''}</p>
                        </div>
                    </div>
                    <span class="text-[10px] font-extrabold uppercase px-2 py-1 rounded-full ${item.isWin ? 'bg-emerald-500 text-neutral-950' : 'bg-neutral-700 text-neutral-300'}">
                        ${item.isWin ? 'GAGNÉ' : 'PERDU'}
                    </span>
                </div>
            `).join('');
        }

        // Événements
        spinMainBtn.addEventListener('click', spinWheel);
        spinCenterBtn.addEventListener('click', spinWheel);
        canvas.addEventListener('click', spinWheel);

        closeModalBtn.addEventListener('click', () => {
            resultModal.classList.add('hidden');
            resultModal.classList.remove('flex');
        });

        soundToggleBtn.addEventListener('click', () => {
            soundEnabled = !soundEnabled;
            if (soundEnabled) {
                initAudio();
                soundIcon.textContent = "🔊";
                soundText.textContent = "Son";
                soundToggleBtn.classList.remove('opacity-60');
            } else {
                soundIcon.textContent = "🔇";
                soundText.textContent = "Muet";
                soundToggleBtn.classList.add('opacity-60');
            }
        });

        staffDrawerBtn.addEventListener('click', () => {
            staffDrawerOverlay.classList.remove('hidden');
            staffDrawerOverlay.classList.add('flex');
        });

        closeDrawerBtn.addEventListener('click', () => {
            staffDrawerOverlay.classList.add('hidden');
            staffDrawerOverlay.classList.remove('flex');
        });

        staffDrawerOverlay.addEventListener('click', (e) => {
            if (e.target === staffDrawerOverlay) {
                staffDrawerOverlay.classList.add('hidden');
                staffDrawerOverlay.classList.remove('flex');
            }
        });

        resetHistoryBtn.addEventListener('click', () => {
            if (!resetArmed) {
                resetArmed = true;
                resetBtnLabel.textContent = "Cliquer encore pour confirmer";
                resetHistoryBtn.classList.add('bg-red-600', 'text-white');
                resetConfirmTimeout = setTimeout(() => {
                    resetArmed = false;
                    resetBtnLabel.textContent = "Réinitialiser l'historique";
                    resetHistoryBtn.classList.remove('bg-red-600', 'text-white');
                }, 3500);
            } else {
                clearTimeout(resetConfirmTimeout);
                resetArmed = false;
                resetBtnLabel.textContent = "Réinitialiser l'historique";
                resetHistoryBtn.classList.remove('bg-red-600', 'text-white');
                spinHistory = [];
                try {
                    localStorage.removeItem('el_patron_wheel_history');
                } catch (e) {}
                renderHistory();
            }
        });


        // Accès participant : une session sécurisée est créée après inscription.
        const registrationGate = document.getElementById('registrationGate');
        const registrationForm = document.getElementById('registrationForm');
        const registrationSubmit = document.getElementById('registrationSubmit');
        const registrationStatus = document.getElementById('registrationStatus');
        const playerWelcome = document.getElementById('playerWelcome');

        function setRegistrationStatus(message, success = false) {
            registrationStatus.textContent = message;
            registrationStatus.classList.toggle('is-success', success);
        }

        function unlockGame(firstName) {
            playerRegistered = true;
            registrationGate.classList.add('is-hidden');
            playerWelcome.textContent = firstName ? `Bienvenue, ${firstName} !` : '';
        }

        async function initializePlayerAccess() {
            try {
                const response = await fetch('/api/session', { credentials: 'same-origin', cache: 'no-store' });
                if (response.ok) {
                    const session = await response.json();
                    if (session.authenticated) {
                        unlockGame(session.firstName);
                        return;
                    }
                }
            } catch (error) {
                console.warn('Vérification de session indisponible:', error);
            }
            registrationGate.classList.remove('is-hidden');
        }

        registrationForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            setRegistrationStatus('');
            if (!registrationForm.reportValidity()) return;

            const formData = new FormData(registrationForm);
            const payload = {
                firstName: formData.get('firstName'),
                lastName: formData.get('lastName'),
                phone: formData.get('phone'),
                email: formData.get('email'),
                privacyConsent: document.getElementById('privacyConsent').checked,
                marketingConsent: document.getElementById('marketingConsent').checked,
                website: formData.get('website')
            };

            registrationSubmit.disabled = true;
            registrationSubmit.innerHTML = '<span>⌛</span> Enregistrement...';
            try {
                const response = await fetch('/api/participants', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'Inscription impossible.');
                setRegistrationStatus(result.message || 'Inscription enregistrée.', true);
                unlockGame(result.participant?.firstName || payload.firstName);
            } catch (error) {
                setRegistrationStatus(error.message || 'Une erreur est survenue. Réessayez.');
            } finally {
                registrationSubmit.disabled = false;
                registrationSubmit.innerHTML = '<span>🎯</span> Accéder à la roue';
            }
        });

        initializePlayerAccess();

        // Observation automatique des dimensions pour un rendu toujours net
        const wheelObserver = new ResizeObserver(() => {
            resizeAndDrawWheel();
        });
        if (canvas.parentElement) {
            wheelObserver.observe(canvas.parentElement);
        }

        window.addEventListener('resize', resizeAndDrawWheel);
        window.addEventListener('load', () => {
            resizeAndDrawWheel();
            renderHistory();
        });
