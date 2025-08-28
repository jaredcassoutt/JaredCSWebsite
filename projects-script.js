// Projects page JavaScript
var loadingSign = document.getElementById("loadingSign");

let featuredProjects = [];
let allProjects = [];
let currentFilter = 'all';

// Notable non-App Store projects
const notableProjects = [
  {
    name: "Mobile ASL Translator",
    description: "Revolutionary iOS application using CreateML and Core ML for real-time American Sign Language alphabet translation through computer vision and machine learning.",
    languages: ["Swift"],
    category: "ai",
    tags: ["ML", "iOS", "Computer Vision", "Accessibility"],
    url: "https://www.youtube.com/watch?v=A3WSZFOyvfk&feature=youtu.be",
    type: "video",
    image: null,
    video: "https://www.youtube.com/watch?v=A3WSZFOyvfk",
    featured: true,
    status: "",
    tech_stack: ["Swift", "Core ML", "CreateML", "Computer Vision"]
  },
  {
    name: "Augmented Reality Graphing App",
    description: "Cutting-edge iOS application that transforms data visualization by allowing users to input mathematical equations and data to create immersive AR bar-charts, pie-graphs, scatterplots, and 3D mesh models.",
    languages: ["Swift", "Python"],
    category: "mobile",
    tags: ["AR", "iOS", "Data Viz", "3D"],
    url: null,
    type: "private",
    image: null,
    video: null,
    featured: true,
    status: "",
    tech_stack: ["Swift", "ARKit", "SceneKit", "Python", "NumPy"]
  }
];

// Fetch App Store apps
async function fetchHaploApps() {
  try {
    const response = await fetch('https://itunes.apple.com/search?term=Haplo%2C+LLC&entity=software&media=software&country=US&limit=20');
    const data = await response.json();
    
    const haploApps = data.results.filter(app => 
      (app.artistName?.toLowerCase().includes('haplo') || 
       app.sellerName?.toLowerCase().includes('haplo')) &&
      !app.trackName?.toLowerCase().includes('sticker')
    );
    
    return haploApps.map(app => ({
      name: app.trackName,
      description: (app.description?.substring(0, 200) + '...' || 'iOS application published on the App Store.'),
      languages: ['Swift'],
      category: 'mobile',
      tags: ['iOS', 'App Store', app.primaryGenreName || 'Productivity'],
      url: app.trackViewUrl,
      type: 'app_store',
      image: app.artworkUrl512 || app.artworkUrl100,
      video: null,
      featured: true,
      status: '',
      tech_stack: ['Swift', 'iOS SDK', 'Xcode'],
      app_rating: app.averageUserRating || 0,
      review_count: app.userRatingCount || 0,
      price: app.formattedPrice || 'Free',
      release_date: app.releaseDate
    }));
  } catch (error) {
    console.error('Error fetching Haplo apps:', error);
    return [];
  }
}

// Fetch GitHub projects
async function fetchGitHubProjects() {
  try {
    const response = await fetch('https://api.github.com/users/jaredcassoutt/repos');
    const githubRepos = await response.json();
    
    return githubRepos
      .filter(repo => repo.language && !featuredProjects.find(p => p.name === repo.name))
      .map(repo => {
        let category = 'web';
        if (repo.language === 'Swift') category = 'mobile';
        if (repo.name.toLowerCase().includes('python') || repo.language === 'Python') category = 'ai';
        
        return {
          name: repo.name,
          description: repo.description || 'A coding project showcasing various programming concepts and implementations.',
          languages: [repo.language],
          category: category,
          tags: [repo.language],
          url: repo.html_url,
          type: 'github',
          image: null,
          video: null,
          featured: false,
          status: 'Open Source',
          tech_stack: [repo.language],
          stars: repo.stargazers_count || 0,
          forks: repo.forks_count || 0,
          updated_at: repo.updated_at
        };
      })
      .sort((a, b) => (b.stars || 0) - (a.stars || 0));
  } catch (error) {
    console.error('Error fetching GitHub repos:', error);
    return [];
  }
}

function displayProjects(projects) {
  const container = document.querySelector("#projectList");
  let content = '';
  
  projects.forEach((project, index) => {
    const languageIcons = project.languages.map(lang => 
      `<span class="tech-badge">
        <img src="${lang}Icon.png" alt="${lang}" onerror="this.style.display='none'"/>
        ${lang}
      </span>`
    ).join('');
    
    const projectIcon = getProjectIcon(project.type);
    const statusClass = getStatusClass(project.status);
    
    content += `
      <div class="project-card glass-card animate-project ${project.featured ? 'featured' : ''}" 
           data-category="${project.category}" 
           style="animation-delay: ${index * 0.1}s">
        
        ${project.featured ? `<div class="featured-badge">${project.type === 'app_store' ? '<i class="fab fa-app-store"></i> App Store' : '⭐ Featured'}</div>` : ''}
        
        <div class="project-header">
          ${project.image ? `<div class="project-app-icon"><img src="${project.image}" alt="${project.name} icon" /></div>` : `<div class="project-icon">${projectIcon}</div>`}
          ${project.status ? `<div class="project-status ${statusClass}">${project.status}</div>` : ''}
        </div>
        
        <div class="project-content">
          <h3 class="project-title">${project.name}</h3>
          <p class="project-description">${project.description}</p>
          
          ${project.type === 'app_store' && (project.app_rating > 0 || project.review_count > 0) ? `
            <div class="app-store-stats">
              ${project.app_rating > 0 ? `<span class="stat-item">⭐ ${project.app_rating.toFixed(1)}</span>` : ''}
              ${project.review_count > 0 ? `<span class="stat-item">👥 ${project.review_count} reviews</span>` : ''}
              ${project.price ? `<span class="stat-item price">🏷️ ${project.price}</span>` : ''}
            </div>
          ` : ''}
          
          ${project.type === 'github' && (project.stars > 0 || project.forks > 0) ? `
            <div class="github-stats">
              ${project.stars > 0 ? `<span class="stat-item"><i class="fas fa-star"></i> ${project.stars}</span>` : ''}
              ${project.forks > 0 ? `<span class="stat-item"><i class="fas fa-code-branch"></i> ${project.forks}</span>` : ''}
            </div>
          ` : ''}
          
          <div class="project-tech">
            ${languageIcons}
          </div>
          
          <div class="project-tags">
            ${project.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
          </div>
        </div>
        
        <div class="project-footer">
          <div class="project-links">
            ${project.url ? getProjectLink(project) : '<span class="private-label">🔒 Private</span>'}
          </div>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = content;
  
  // Add scroll animations
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0) scale(1)';
      }
    });
  }, { threshold: 0.1 });
  
  document.querySelectorAll('.animate-project').forEach(el => {
    observer.observe(el);
  });
}

function getProjectIcon(type) {
  const icons = {
    'app_store': '<i class="fab fa-app-store"></i>',
    'github': '<i class="fab fa-github"></i>',
    'video': '<i class="fab fa-youtube"></i>',
    'private': '💻'
  };
  return icons[type] || '💻';
}

function getStatusClass(status) {
  if (status.includes('Live') || status.includes('App Store')) return 'status-live';
  if (status.includes('Development')) return 'status-dev';
  if (status.includes('Prototype')) return 'status-prototype';
  return 'status-default';
}

function getProjectLink(project) {
  const linkText = {
    'app_store': '⬇️ Download',
    'github': '<i class="fab fa-github"></i> View Code',
    'video': '▶️ Watch Demo'
  };
  
  return `<a href="${project.url}" target="_blank" class="project-link btn-haplo btn-haplo-primary">
            ${linkText[project.type] || '🔗 View'}
          </a>`;
}

function setupFilters() {
  const filterButtons = document.querySelectorAll('.filter-btn');
  
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Update active button
      filterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Filter projects
      const filter = btn.dataset.filter;
      currentFilter = filter;
      
      const projectCards = document.querySelectorAll('.project-card');
      projectCards.forEach(card => {
        if (filter === 'all' || card.dataset.category === filter) {
          card.style.display = 'block';
          card.style.animation = 'fadeInUp 0.5s ease-out forwards';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });
}

// Main loading function
async function loadAllProjects() {
  try {
    console.log('Loading projects...');
    const appStoreApps = await fetchHaploApps();
    console.log('App Store apps loaded:', appStoreApps.length);
    
    featuredProjects = [...appStoreApps, ...notableProjects];
    
    const githubProjects = await fetchGitHubProjects();
    console.log('GitHub projects loaded:', githubProjects.length);
    
    allProjects = [...featuredProjects, ...githubProjects];
    
    displayProjects(allProjects);
    setupFilters();
  } catch (error) {
    console.error('Error loading projects:', error);
    // Fallback to just notable projects
    allProjects = notableProjects;
    displayProjects(allProjects);
    setupFilters();
  } finally {
    loadingSign.style.display = "none";
  }
}

// Start loading when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadAllProjects);
} else {
  loadAllProjects();
}