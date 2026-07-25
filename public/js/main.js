document.addEventListener("DOMContentLoaded", () => {
    loadWebsiteData();
    initScrollCounter();
    fetchMarqueeTicker();
});

let allEventsData = [];

// 🎬 HERO SECTION VIDEO + CLOUDINARY SLIDER ENGINE
function renderHeroSliderImages(events) {
    const sliderContainer = document.getElementById("hero-image-slider");
    const videoElement = document.getElementById("hero-video");

    if (!sliderContainer) return;

    let heroImages = [];

    events.forEach(event => {
        if (event.coverImage) heroImages.push(event.coverImage);
        if (event.images && Array.isArray(event.images)) {
            heroImages = heroImages.concat(event.images);
        } else if (event.photos && Array.isArray(event.photos)) {
            heroImages = heroImages.concat(event.photos);
        }
    });

    heroImages = [...new Set(heroImages)].filter(url => url && url.length > 5);

    if (heroImages.length === 0) return;

    if (videoElement) {
        videoElement.style.opacity = "0.35";
    }

    let currentIndex = 0;
    sliderContainer.style.backgroundImage = `url('${heroImages[0]}')`;
    sliderContainer.style.opacity = "1";

    setInterval(() => {
        currentIndex = (currentIndex + 1) % heroImages.length;
        sliderContainer.style.transition = "background-image 1s ease-in-out, opacity 1s ease-in-out";
        sliderContainer.style.backgroundImage = `url('${heroImages[currentIndex]}')`;
    }, 4000);
}

function loadWebsiteData() {
    const noticeList = document.getElementById("notice-list");
    
    fetch('/api/data')
        .then(response => response.json())
        .then(data => {
            if (data.events && data.events.length > 0) {
                renderHeroSliderImages(data.events);
            }
            
            if (noticeList && data.notices && data.notices.length > 0) {
                noticeList.innerHTML = "";

                const orderedNotices = [...data.notices].reverse();

                orderedNotices.forEach((item, index) => {
                    const rowItem = document.createElement("div");
                    rowItem.className = "classic-notice-item";
                    rowItem.setAttribute("onclick", "openNoticePopup(this)");

                    const blinkBadgeHTML = (index === 0) ? `<span class="blink-new-badge">NEW</span>` : '';

                    rowItem.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <i class="fas fa-file-alt" style="color: var(--accent-lime); font-size: 1rem; opacity: 0.7;"></i>
                        <h3 style="margin: 0; color: var(--primary-brand); font-size: 0.95rem; font-weight: 600;">
                            ${item.title} ${blinkBadgeHTML}
                        </h3>
                    </div>
                    <span class="classic-notice-date"><i class="far fa-clock"></i> ${item.date}</span>
                    <div class="notice-descr-hidden" style="display: none;">${item.description}</div>`;
                    noticeList.appendChild(rowItem);
                });
            }

            allEventsData = data.events || [];
            renderEventCards();

            if (document.getElementById('hero-video') && document.getElementById('hero-image-slider')) {
                startHeroDynamicLoop(data.events);
            }
        })
        .catch(err => {
            console.error("Data processing error:", err);
            if (document.getElementById('hero-video') && document.getElementById('hero-image-slider')) {
                startHeroDynamicLoop([]);
            }
        });
}

// 📜 ADVANCED COMBINED MARQUEE TICKER ENGINE
function fetchMarqueeTicker() {
    fetch('/api/data')
        .then(res => res.json())
        .then(data => {
            const marqueeElement = document.getElementById("dynamic-marquee-text");
            if (!marqueeElement) return;

            let tickerItems = [];

            // 1. Dedicated Admin Tickers
            if (data.tickers && data.tickers.length > 0) {
                [...data.tickers].reverse().forEach(t => {
                    tickerItems.push(`🚩 <b>Update:</b> ${t.text}`);
                });
            }

            // 2. Checked Achievements (Class 10th / 12th / Awards)
            if (data.achievements && data.achievements.length > 0) {
                data.achievements.filter(a => a.showInMarquee).forEach(a => {
                    const catLabel = a.category === 'class-xii' ? 'Class XII' : (a.category === 'class-x' ? 'Class X' : 'Award');
                    tickerItems.push(`🏆 <b>${catLabel} Topper:</b> ${a.title} Scored ${a.subtitle}`);
                });
            }

            // 3. Checked Upcoming Events
            if (data.upcomingEvents && data.upcomingEvents.length > 0) {
                data.upcomingEvents.filter(u => u.showInMarquee).forEach(u => {
                    tickerItems.push(`📅 <b>Upcoming Event:</b> ${u.title} on ${u.eventDate} (${u.venue})`);
                });
            }

            // Render output
            if (tickerItems.length > 0) {
                marqueeElement.innerHTML = tickerItems.join(' &nbsp;&nbsp;&nbsp;&nbsp; | &nbsp;&nbsp;&nbsp;&nbsp; ');
            } else if (data.notices && data.notices.length > 0) {
                // Fallback to Latest Notices if nothing selected
                const noticeText = [...data.notices].reverse().map(n => `📢 <b>${n.title}:</b> ${n.description}`).join(' &nbsp;&nbsp;&nbsp;&nbsp; | &nbsp;&nbsp;&nbsp;&nbsp; ');
                marqueeElement.innerHTML = noticeText;
            } else {
                marqueeElement.innerHTML = "🎉 Welcome to Patliputra Vidyapeeth! Admissions Open for Session 2026-2027.";
            }
        })
        .catch(err => {
            console.error("Error fetching ticker data:", err);
        });
}

function renderEventCards() {
    const galleryGrid = document.getElementById("gallery-grid");
    if (!galleryGrid) return;

    if (!allEventsData || allEventsData.length === 0) {
        galleryGrid.innerHTML = "<p style='text-align:center; grid-column: 1/-1; color:#bbb;'>गैलरी अभी खाली है।</p>";
        return;
    }

    galleryGrid.innerHTML = "";

    const recent4Events = [...allEventsData].reverse().slice(0, 4);

    recent4Events.forEach(event => {
        const coverImg = event.coverImage || (event.images && event.images[0]) || '/uploads/default-event.jpg';
        const eventCard = document.createElement("div");
        eventCard.className = "gallery-card";
        
        eventCard.setAttribute("onclick", `openEventGallery(${event.id})`);
        
        eventCard.innerHTML = `
            <img src="${coverImg}" alt="${event.title}">
            <div class="gallery-overlay" style="opacity: 1;">
                <h3>🎉 ${event.title}</h3>
                <p>${event.description} (${event.images ? event.images.length : 0} Photos)</p>
            </div>
        `;
        galleryGrid.appendChild(eventCard);
    });
}

function openEventGallery(eventId) {
    const galleryGrid = document.getElementById("gallery-grid");
    const selectedEvent = allEventsData.find(e => e.id === eventId);

    if (!selectedEvent) return;

    galleryGrid.innerHTML = `
        <div style="grid-column: 1/-1; margin-bottom: 20px; text-align: left;">
            <button onclick="renderEventCards()" style="background: #aeea00; color: #111827; border: none; padding: 10px 20px; font-weight: bold; border-radius: 6px; cursor: pointer; font-family: inherit;">
                ← Back to Albums
            </button>
            <h2 style="color: white; margin-top: 15px; font-size: 1.8rem;">${selectedEvent.title} Album</h2>
            <p style="color: #bbb;">${selectedEvent.description}</p>
        </div>
    `;

    if (selectedEvent.images && Array.isArray(selectedEvent.images)) {
        selectedEvent.images.forEach(imgUrl => {
            const imgCard = document.createElement("div");
            imgCard.className = "gallery-card";
            imgCard.innerHTML = `<img src="${imgUrl}" alt="Event Photo">`;
            galleryGrid.appendChild(imgCard);
        });
    }

    galleryGrid.scrollIntoView({ behavior: 'smooth' });
}

function initScrollCounter() {
    const counters = document.querySelectorAll('.stat-counter');
    const speed = 200;

    const startCounter = (counter) => {
        const updateCount = () => {
            const target = +counter.getAttribute('data-target');
            const count = +counter.innerText;
            const inc = Math.ceil(target / speed);

            if (count < target) {
                counter.innerText = count + inc;
                setTimeout(updateCount, 15);
            } else {
                counter.innerText = target + (target === 100 ? "%" : "+");
            }
        };
        updateCount();
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                startCounter(entry.target);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });

    counters.forEach(counter => observer.observe(counter));
}

let currentSlideIndex = 0;
let totalSlidesCount = 0;

function openLabModal(facilityType) {
    const modal = document.getElementById("lab-modal");
    const titleElement = document.getElementById("lab-modal-title");
    const container = document.getElementById("lab-modal-images");
    const dotsContainer = document.getElementById("slider-dots");

    if (!modal || !container) return;

    container.innerHTML = "";
    if (dotsContainer) dotsContainer.innerHTML = "";
    currentSlideIndex = 0;

    let titleText = "";
    let imagesArray = [];

    if (facilityType === 'computer') {
        titleText = "🖥️ High-Tech Computer Laboratory";
        imagesArray = ["/images/comp1.jpg", "/images/comp2.jpg", "/images/comp3.jpg"];
    } else if (facilityType === 'science') {
        titleText = "🔬 Advanced Composite Science Lab";
        imagesArray = ["/images/sci1.jpg", "/images/sci2.jpg", "/images/sci3.jpg"];
    } else if (facilityType === 'library') {
        titleText = "📚 Digital & Resource Rich Library";
        imagesArray = ["/images/lib1.jpg", "/images/lib2.jpg", "/images/lib3.jpg", "/images/lib4.jpg"];
    } else {
        titleText = "Facilities Gallery";
        imagesArray = ["/images/sports.jpg"];
    }

    titleElement.innerText = titleText;
    totalSlidesCount = imagesArray.length;

    imagesArray.forEach((imgUrl, idx) => {
        const slideDiv = document.createElement("div");
        slideDiv.className = `lab-slide-item ${idx === 0 ? 'active' : ''}`;
        slideDiv.innerHTML = `<img src="${imgUrl}" alt="Slide ${idx + 1}" onerror="this.src='https://images.unsplash.com/photo-1521587760476-6c12a4b040da?w=800'">`;
        container.appendChild(slideDiv);

        if (dotsContainer) {
            const dot = document.createElement("span");
            dot.className = `slider-dot ${idx === 0 ? 'active' : ''}`;
            dot.setAttribute("onclick", `goToSlide(${idx})`);
            dotsContainer.appendChild(dot);
        }
    });

    modal.style.display = "flex";
}

function closeLabModal() {
    const modal = document.getElementById("lab-modal");
    if (modal) modal.style.display = "none";
}

function moveSlide(direction) {
    let newIndex = currentSlideIndex + direction;
    if (newIndex >= totalSlidesCount) newIndex = 0;
    if (newIndex < 0) newIndex = totalSlidesCount - 1;
    goToSlide(newIndex);
}

function goToSlide(targetIndex) {
    currentSlideIndex = targetIndex;
    
    const slides = document.querySelectorAll(".lab-slide-item");
    slides.forEach((slide, idx) => {
        slide.classList.toggle("active", idx === currentSlideIndex);
    });

    const dots = document.querySelectorAll(".slider-dot");
    dots.forEach((dot, idx) => {
        dot.classList.toggle("active", idx === currentSlideIndex);
    });
}

window.addEventListener("click", function(event) {
    const modal = document.getElementById("lab-modal");
    if (event.target === modal) {
        closeLabModal();
    }
});

window.openEnquiryModal = function() {
    const modal = document.getElementById("enquiry-modal");
    if (modal) modal.style.display = "flex";
}

window.closeEnquiryModal = function() {
    const modal = document.getElementById("enquiry-modal");
    if (modal) modal.style.display = "none";
}

document.addEventListener("DOMContentLoaded", function () {
    const headerContainer = document.getElementById('dynamic-header');
    if (headerContainer) {
        fetch('/header.html')
            .then(res => res.text())
            .then(data => {
                headerContainer.innerHTML = data;
                initializeMobileNav();
            })
            .catch(err => console.error("Header Error:", err));
    }

    const footerContainer = document.getElementById('dynamic-footer');
    if (footerContainer) {
        fetch('/footer.html')
            .then(res => res.text())
            .then(data => { footerContainer.innerHTML = data; })
            .catch(err => console.error("Footer Error:", err));
    }
});

function startHeroDynamicLoop(events) {
    const video = document.getElementById('hero-video');
    const slider = document.getElementById('hero-image-slider');
    if (!video || !slider) return;

    let recentImages = [];
    if (events && Array.isArray(events)) {
        events.forEach(event => {
            if (event && event.images && Array.isArray(event.images)) {
                recentImages = recentImages.concat(event.images);
            }
        });
    }

    if (recentImages.length < 4) {
        recentImages = [
            'https://placehold.co/1200x600?text=Campus+Life+1',
            'https://placehold.co/1200x600?text=Science+Lab+2',
            'https://placehold.co/1200x600?text=Sports+Day+3',
            'https://placehold.co/1200x600?text=Smart+Class+4'
        ];
    }

    recentImages.sort(() => 0.5 - Math.random());
    let selectedImages = recentImages.slice(0, 4);
    let currentStep = 0;

    if (window.heroSliderInterval) clearInterval(window.heroSliderInterval);

    window.heroSliderInterval = setInterval(() => {
        if (currentStep === 0) {
            video.style.opacity = '0';
            slider.style.opacity = '1';
            slider.style.backgroundImage = `url('${selectedImages[0]}')`;
            currentStep = 1;
        } else if (currentStep < selectedImages.length) {
            slider.style.backgroundImage = `url('${selectedImages[currentStep]}')`;
            currentStep++;
        } else {
            slider.style.opacity = '0';
            video.style.opacity = '1';
            currentStep = 0;
            selectedImages.sort(() => 0.5 - Math.random());
        }
    }, 6000);
}

function initializeMobileNav() {
    const hamburger = document.getElementById('mobile-toggle-btn');
    const navLinks = document.querySelector('.header-menu-navigation'); 
    const dropdownToggles = document.querySelectorAll('.dropdown-toggle-link');

    if (hamburger && navLinks) {
        hamburger.addEventListener('click', (e) => {
            e.stopPropagation();
            
            navLinks.classList.toggle("nav-active");
            navLinks.classList.toggle("active");
            
            const icon = hamburger.querySelector("i");
            if (icon) {
                if (navLinks.classList.contains("nav-active") || navLinks.classList.contains("active")) {
                    icon.className = 'fas fa-times'; 
                    hamburger.style.setProperty('color', '#ffffff', 'important');
                } else {
                    icon.className = 'fas fa-bars';  
                    hamburger.style.setProperty('color', 'var(--primary-brand)', 'important');
                }
            }
        });
    }

    if (dropdownToggles) {
        dropdownToggles.forEach(toggle => {
            toggle.addEventListener("click", (e) => {
                if (window.innerWidth <= 991) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const parentLi = toggle.closest(".nav-dropdown-item");
                    
                    document.querySelectorAll(".nav-dropdown-item").forEach(item => {
                        if (item !== parentLi) {
                            item.classList.remove("mobile-active");
                        }
                    });

                    if (parentLi) {
                        parentLi.classList.toggle("mobile-active");
                    }
                }
            });
        });
    }

    document.addEventListener("click", (e) => {
        if (navLinks && (navLinks.classList.contains("nav-active") || navLinks.classList.contains("active"))) {
            if (e.target.classList.contains('dropdown-toggle-link') || e.target.closest('.dropdown-toggle-link')) {
                return;
            }
            
            if (!navLinks.contains(e.target) && !hamburger.contains(e.target)) {
                navLinks.classList.remove("nav-active");
                navLinks.classList.remove("active");
                
                document.querySelectorAll(".nav-dropdown-item").forEach(item => {
                    item.classList.remove("mobile-active");
                });
                
                const icon = hamburger.querySelector("i");
                if (icon) {
                    icon.className = 'fas fa-bars';
                    hamburger.style.setProperty('color', 'var(--primary-brand)', 'important');
                }
            }
        }
    });
}

function openNoticePopup(cardElement) {
    const dateText = cardElement.querySelector('.classic-notice-date').innerHTML;
    const titleText = cardElement.querySelector('h3').childNodes[0].textContent.trim();
    const bodyText = cardElement.querySelector('.notice-descr-hidden').innerHTML;

    document.getElementById('popup-date').innerHTML = `<i class="fas fa-calendar-day"></i> Published: ${dateText}`;
    document.getElementById('popup-title').innerText = titleText;
    document.getElementById('popup-body').innerHTML = bodyText;

    document.getElementById('notice-popup').style.display = 'flex';
}

function closeNoticePopup() {
    document.getElementById('notice-popup').style.display = 'none';
}

function closeNoticePopupOutside(event) {
    if (event.target === document.getElementById('notice-popup')) {
        closeNoticePopup();
    }
}

function openDocModal(category) {
    fetch('/api/data')
        .then(res => res.json())
        .then(data => {
            const docs = data.documents || [];
            const filteredDocs = docs.filter(d => d.category === category);

            if (filteredDocs.length === 0) {
                alert("अभी इस सेक्शन में स्कूल प्रशासन द्वारा कोई भी PDF अपलोड नहीं की गई है!");
                return;
            }

            const latestDoc = filteredDocs[filteredDocs.length - 1];
            window.open(latestDoc.fileUrl, '_blank');
        })
        .catch(err => {
            console.error("Error redirecting to file stream:", err);
            alert("डेटाबेस से फाइल लोड करने में समस्या आ रही है!");
        });
}

function closeDocModal() {
    document.getElementById('doc-list-modal').style.display = 'none';
}

function loadCampusInfrastructure() {
    const targetContainer = document.getElementById('my-dynamic-component');
    if (targetContainer) {
        fetch('/campus')
            .then(res => {
                if (!res.ok) throw new Error("Component HTTP request failure");
                return res.text(); 
            })
            .then(htmlText => {
                targetContainer.innerHTML = htmlText;
            })
            .catch(err => console.error("Component injection failed:", err));
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadCampusInfrastructure);
} else {
    loadCampusInfrastructure();
}