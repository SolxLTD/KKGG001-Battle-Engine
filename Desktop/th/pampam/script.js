const WHATSAPP_NUMBER = "2348037203930";

if (typeof AOS !== "undefined") {
    AOS.init({
        duration: 800,
        once: true
    });
}

const inquiryForm = document.getElementById("reservation-form");
const projectForm = document.getElementById("project-form");
const galleryRoot = document.getElementById("project-gallery");
const dashboardProjectsRoot = document.getElementById("dashboard-projects");
const submissionsRoot = document.getElementById("submission-list");
const projectPreview = document.getElementById("project-preview");
const adminLoginForm = document.getElementById("admin-login-form");
const adminLogoutButton = document.getElementById("admin-logout-button");

initializeApp();

async function initializeApp() {
    await loadProjectsIntoGallery();
    setupInquiryForm();
    setupProjectDashboard();
    setupAdminLogin();
    setupAdminLogout();
    await initializeDashboardData();
}

async function initializeDashboardData() {
    if (!dashboardProjectsRoot && !submissionsRoot) {
        return;
    }

    const session = await fetchSession();
    if (!session.authenticated) {
        return;
    }

    await Promise.all([
        loadProjectsForDashboard(),
        loadSubmissions()
    ]);
}

async function loadProjectsIntoGallery() {
    if (!galleryRoot) {
        return;
    }

    try {
        const response = await fetch("/api/projects", {
            headers: {
                Accept: "application/json"
            }
        });

        if (!response.ok) {
            throw new Error("Could not load projects");
        }

        const data = await response.json();
        renderProjectGallery(Array.isArray(data.projects) ? data.projects : []);
    } catch (error) {
        galleryRoot.innerHTML = '<p class="empty-state">Projects are unavailable right now. Please try again later.</p>';
    }
}

async function loadProjectsForDashboard() {
    if (!dashboardProjectsRoot) {
        return;
    }

    try {
        const response = await fetch("/api/projects", {
            headers: {
                Accept: "application/json"
            }
        });

        if (!response.ok) {
            throw new Error("Could not load projects");
        }

        const data = await response.json();
        renderDashboardProjects(Array.isArray(data.projects) ? data.projects : []);
    } catch (error) {
        dashboardProjectsRoot.innerHTML = '<p class="empty-state">Projects could not be loaded.</p>';
    }
}

async function loadSubmissions() {
    if (!submissionsRoot) {
        return;
    }

    try {
        const response = await fetch("/api/admin/submissions", {
            headers: {
                Accept: "application/json"
            }
        });

        if (response.status === 401) {
            window.location.href = "admin-login.html";
            return;
        }

        if (!response.ok) {
            throw new Error("Could not load submissions");
        }

        const data = await response.json();
        renderSubmissionList(Array.isArray(data.submissions) ? data.submissions : []);
    } catch (error) {
        submissionsRoot.innerHTML = '<p class="empty-state">Contact submissions could not be loaded.</p>';
    }
}

function setupInquiryForm() {
    if (!inquiryForm) {
        return;
    }

    const statusMessage = document.getElementById("form-status");
    const honeypotInput = document.getElementById("website");
    const submitButton = inquiryForm.querySelector('button[type="submit"]');

    inquiryForm.addEventListener("submit", handleInquiry);

    function setStatus(message) {
        setTextStatus(statusMessage, message);
    }

    async function handleInquiry(event) {
        event.preventDefault();

        const payload = {
            name: document.getElementById("name").value.trim(),
            phone: document.getElementById("phone").value.trim(),
            projectType: document.getElementById("project-type").value.trim(),
            location: document.getElementById("location").value.trim(),
            timeline: document.getElementById("timeline").value.trim(),
            message: document.getElementById("message").value.trim()
        };

        const phonePattern = /^[0-9+()\-\s]{7,20}$/;

        if (honeypotInput && honeypotInput.value.trim() !== "") {
            setStatus("Inquiry could not be sent. Please try again.");
            return;
        }

        if (!payload.name || !payload.phone || !payload.projectType || !payload.location || !payload.timeline || !payload.message) {
            setStatus("Please complete every field before continuing.");
            return;
        }

        if (!phonePattern.test(payload.phone)) {
            setStatus("Please enter a valid phone number.");
            return;
        }

        setButtonBusyState(submitButton, true, "Sending...", "Send Project Request");
        setStatus("Saving your inquiry...");

        try {
            const response = await fetch("/api/contact", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json"
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (!response.ok) {
                setStatus(data.error || "Inquiry could not be sent. Please try again.");
                return;
            }

            inquiryForm.reset();
            setStatus("Inquiry sent successfully. The admin can now view it in the dashboard.");
        } catch (error) {
            setStatus("Inquiry could not be sent. Please check the server and try again.");
        } finally {
            setButtonBusyState(submitButton, false, "Sending...", "Send Project Request");
        }
    }
}

function setupProjectDashboard() {
    if (!projectForm) {
        return;
    }

    const imageInput = document.getElementById("project-image");
    const status = document.getElementById("project-form-status");

    imageInput.addEventListener("change", handleImagePreview);
    projectForm.addEventListener("submit", handleProjectSubmit);

    function setStatus(message) {
        setTextStatus(status, message);
    }

    function handleImagePreview() {
        const file = imageInput.files && imageInput.files[0];

        if (!file || !projectPreview) {
            return;
        }

        const reader = new FileReader();
        reader.onload = function () {
            projectPreview.src = String(reader.result);
            projectPreview.classList.add("is-visible");
        };
        reader.readAsDataURL(file);
    }

    function handleProjectSubmit(event) {
        event.preventDefault();

        const title = document.getElementById("project-title").value.trim();
        const category = document.getElementById("project-category").value.trim();
        const caption = document.getElementById("project-caption").value.trim();
        const file = imageInput.files && imageInput.files[0];
        const submitButton = projectForm.querySelector('button[type="submit"]');

        if (!title || !category || !caption || !file) {
            setStatus("Please complete every field and choose a project image.");
            return;
        }

        setButtonBusyState(submitButton, true, "Saving Project...", "Add Project");
        setStatus("Uploading project...");

        const reader = new FileReader();
        reader.onload = async function () {
            try {
                const response = await fetch("/api/admin/projects", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "application/json"
                    },
                    body: JSON.stringify({
                        title,
                        category,
                        caption,
                        image: String(reader.result)
                    })
                });

                const data = await response.json();

                if (response.status === 401) {
                    window.location.href = "admin-login.html";
                    return;
                }

                if (!response.ok) {
                    setStatus(data.error || "Project could not be saved.");
                    return;
                }

                projectForm.reset();

                if (projectPreview) {
                    projectPreview.removeAttribute("src");
                    projectPreview.classList.remove("is-visible");
                }

                await Promise.all([
                    loadProjectsIntoGallery(),
                    loadProjectsForDashboard()
                ]);

                setStatus("Project saved successfully.");
            } catch (error) {
                setStatus("Project could not be saved. Please try again.");
            } finally {
                setButtonBusyState(submitButton, false, "Saving Project...", "Add Project");
            }
        };

        reader.onerror = function () {
            setStatus("Image could not be read. Please choose another file and try again.");
            setButtonBusyState(submitButton, false, "Saving Project...", "Add Project");
        };

        reader.readAsDataURL(file);
    }
}

function setupAdminLogin() {
    if (!adminLoginForm) {
        return;
    }

    const passwordInput = document.getElementById("admin-password");
    const status = document.getElementById("admin-login-status");
    const submitButton = adminLoginForm.querySelector('button[type="submit"]');

    adminLoginForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const password = passwordInput.value.trim();

        if (!password) {
            setTextStatus(status, "Please enter the admin password.");
            return;
        }

        setButtonBusyState(submitButton, true, "Signing In...", "Sign In");
        setTextStatus(status, "Checking admin access...");

        try {
            const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json"
                },
                body: JSON.stringify({ password })
            });

            const data = await response.json();

            if (!response.ok) {
                setTextStatus(status, data.error || "Login failed.");
                return;
            }

            window.location.href = "dashboard.html";
        } catch (error) {
            setTextStatus(status, "Login failed. Please check the server and try again.");
        } finally {
            setButtonBusyState(submitButton, false, "Signing In...", "Sign In");
        }
    });
}

function setupAdminLogout() {
    if (!adminLogoutButton) {
        return;
    }

    adminLogoutButton.addEventListener("click", async function () {
        try {
            await fetch("/api/auth/logout", {
                method: "POST",
                headers: {
                    Accept: "application/json"
                }
            });
        } finally {
            window.location.href = "admin-login.html";
        }
    });
}

async function fetchSession() {
    try {
        const response = await fetch("/api/auth/session", {
            headers: {
                Accept: "application/json"
            }
        });

        if (!response.ok) {
            return { authenticated: false };
        }

        return response.json();
    } catch (error) {
        return { authenticated: false };
    }
}

function renderProjectGallery(projects) {
    if (!galleryRoot) {
        return;
    }

    galleryRoot.innerHTML = projects.map(createProjectCardMarkup).join("");
}

function renderDashboardProjects(projects) {
    if (!dashboardProjectsRoot) {
        return;
    }

    dashboardProjectsRoot.innerHTML = projects.map(createDashboardProjectMarkup).join("");

    dashboardProjectsRoot.querySelectorAll("[data-delete-project]").forEach((button) => {
        button.addEventListener("click", async function () {
            const id = button.getAttribute("data-delete-project");
            const originalLabel = button.textContent;

            setButtonBusyState(button, true, "Removing...", originalLabel);

            try {
                const response = await fetch(`/api/admin/projects/${encodeURIComponent(id)}`, {
                    method: "DELETE",
                    headers: {
                        Accept: "application/json"
                    }
                });

                if (response.status === 401) {
                    window.location.href = "admin-login.html";
                    return;
                }

                await Promise.all([
                    loadProjectsIntoGallery(),
                    loadProjectsForDashboard()
                ]);
            } catch (error) {
                setButtonBusyState(button, false, "Removing...", originalLabel);
                return;
            }
        });
    });
}

function renderSubmissionList(submissions) {
    if (!submissionsRoot) {
        return;
    }

    if (!submissions.length) {
        submissionsRoot.innerHTML = '<p class="empty-state">No contact submissions yet.</p>';
        return;
    }

    submissionsRoot.innerHTML = submissions.map(createSubmissionMarkup).join("");
}

function createProjectCardMarkup(project) {
    const imageMarkup = project.image
        ? `<img src="${project.image}" alt="${escapeHtml(project.title)}" class="project-image">`
        : `<div class="project-placeholder"><span>${escapeHtml(project.category)}</span></div>`;

    return `
        <article class="showcase-card">
            <div class="showcase-media">${imageMarkup}</div>
            <div class="showcase-copy">
                <p class="project-chip">${escapeHtml(project.category)}</p>
                <h3>${escapeHtml(project.title)}</h3>
                <p>${escapeHtml(project.caption)}</p>
            </div>
        </article>
    `;
}

function createDashboardProjectMarkup(project) {
    const imageMarkup = project.image
        ? `<img src="${project.image}" alt="${escapeHtml(project.title)}" class="dashboard-project-image">`
        : `<div class="dashboard-project-placeholder">${escapeHtml(project.category)}</div>`;

    return `
        <article class="dashboard-project-card">
            <div class="dashboard-project-media">${imageMarkup}</div>
            <div class="dashboard-project-copy">
                <p class="project-chip">${escapeHtml(project.category)}</p>
                <h3>${escapeHtml(project.title)}</h3>
                <p>${escapeHtml(project.caption)}</p>
                <button type="button" class="delete-button" data-delete-project="${escapeHtml(project.id)}">Remove Project</button>
            </div>
        </article>
    `;
}

function createSubmissionMarkup(submission) {
    const createdAt = formatDateTime(submission.createdAt);
    const whatsappMessage = [
        "Hello,",
        "",
        "This is regarding your project inquiry with PAMA Reality & Tech Int'l Ltd.",
        "",
        `Name: ${submission.name}`,
        `Project Type: ${submission.projectType}`,
        `Location: ${submission.location}`
    ].join("\n");

    return `
        <article class="submission-card">
            <div class="submission-meta">
                <p class="project-chip">${escapeHtml(submission.projectType)}</p>
                <span>${escapeHtml(createdAt)}</span>
            </div>
            <h3>${escapeHtml(submission.name)}</h3>
            <p><strong>Phone:</strong> <a href="tel:${escapeHtml(submission.phone)}">${escapeHtml(submission.phone)}</a></p>
            <p><strong>Location:</strong> ${escapeHtml(submission.location)}</p>
            <p><strong>Timeline:</strong> ${escapeHtml(submission.timeline)}</p>
            <p><strong>Brief:</strong> ${escapeHtml(submission.message)}</p>
            <a class="btn btn-small" href="https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(whatsappMessage)}" target="_blank" rel="noopener noreferrer">Reply on WhatsApp</a>
        </article>
    `;
}

function setTextStatus(element, message) {
    if (element) {
        element.textContent = message;
    }
}

function setButtonBusyState(button, isBusy, busyLabel, defaultLabel) {
    if (!button) {
        return;
    }

    button.disabled = isBusy;
    button.textContent = isBusy ? busyLabel : defaultLabel;
}

function formatDateTime(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "Recently";
    }

    return new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(date);
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
