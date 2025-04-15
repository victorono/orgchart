/**
 * HTMLOrgChart.js - Lightweight library for generating organization charts with HTML and CSS
 * Implementation with UL/LI structure for better hierarchy and CSS-based connections
 */
class HTMLOrgChart {
  constructor(config) {
    // Validate basic configuration
    if (!config.container) {
      throw new Error('A container must be specified');
    }
    if (!config.data) {
      throw new Error('Data is required to generate the organization chart');
    }

    // Get container element
    this.container = document.getElementById(config.container);
    if (!this.container) {
      throw new Error(`Container with ID '${config.container}' not found`);
    }

    // Default configuration
    const defaultOptions = {
      nodeWidth: 180,
      nodeHeight: 140,
      horizontalSpacing: 40,
      verticalSpacing: 60,
      avatarSize: 60,
      nodeColor: "#4ade80",
      lineColor: "#4ade80",
      textColor: "#000000",
      subtitleColor: "#6b7280",
      initiallyExpanded: false,
      initialVisibleLevels: 1,
      autoCenterLevels: 2, // New option: automatically center when number of visible levels matches this
      sortBy: 'name',
      sortDirection: 'asc',
      sortFunction: null,
      showSortControls: false,
      initialZoom: 0.8,
      minHeight: '300px', // Default minimum height
      fullscreenBgColor: '#fff',
      // Default timeout values (in milliseconds)
      timeouts: {
        initialCenter: 300,       // Time for initial centering
        centerVerification: 500,  // Additional centering verification
        connectorRedraw: 50,      // Time to redraw connectors
        nodeToggleUpdate: 300,    // Time to update DOM after expanding/collapsing
        wheelZoomDebounce: 100,   // Debounce for wheel zoom
        renderConnectors: 100,    // Time to render initial connectors
        fullscreenAdjust: 100,    // Time for adjustment after fullscreen
        autoZoomAdjust: 100       // Time for auto zoom adjustment
      }
    };

    // Combine default options with provided ones
    this.options = { ...defaultOptions, ...(config.options || {}) };

    // Ensure timeouts property exists and combine with defaults
    if (!this.options.timeouts) this.options.timeouts = {};
    this.options.timeouts = { ...defaultOptions.timeouts, ...this.options.timeouts };

    // Configure timeouts as properties for compatibility with existing code
    this.TIMEOUTS = {
      INITIAL_CENTER: this.options.timeouts.initialCenter,
      CENTER_VERIFICATION: this.options.timeouts.centerVerification,
      CONNECTOR_REDRAW: this.options.timeouts.connectorRedraw,
      NODE_TOGGLE_UPDATE: this.options.timeouts.nodeToggleUpdate,
      WHEEL_ZOOM_DEBOUNCE: this.options.timeouts.wheelZoomDebounce,
      RENDER_CONNECTORS: this.options.timeouts.renderConnectors,
      FULLSCREEN_ADJUST: this.options.timeouts.fullscreenAdjust,
      AUTO_ZOOM_ADJUST: this.options.timeouts.autoZoomAdjust
    };

    // Organization chart data
    this.data = config.data;

    // Processed data in hierarchical format
    this.hierarchicalData = null;

    // Map to store node expansion state
    this.expandedNodes = new Map();

    // Initialize
    this.initialize();
  }

  /**
   * Initializes the organization chart
   */
  initialize() {
    // Process data
    this.processData();

    // Render
    this.render();

    // Setup zoom and drag controls
    this.setupZoomControls();

    // Setup resize observer if available
    this.setupResizeObserver();

    // Ensure the organization chart is initially centered
    // with an appropriate delay to allow the DOM to fully render
    setTimeout(() => {
      this.forceCenterWithScale(this.options.initialZoom);

      // Additional verification after a longer time
      setTimeout(() => {
        this.forceCenterWithScale(this.options.initialZoom);
      }, this.TIMEOUTS.CENTER_VERIFICATION);
    }, this.TIMEOUTS.INITIAL_CENTER);
  }

  /**
   * Forces the organization chart to center with a specific scale
   * @param {number} scale - The scale to apply
   */
  forceCenterWithScale(scale) {
    if (!this.chartContainer || !this.container) return;

    // Ensure the scale is valid
    if (isNaN(scale) || scale <= 0) {
      scale = 1; // Default value if scale is invalid
    }

    // Set the current scale
    this.scale = scale;

    // Get container dimensions
    const containerRect = this.container.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    // To get accurate measurements, temporarily remove any transformation
    const originalTransform = this.chartContainer.style.transform;
    this.chartContainer.style.transform = '';

    // Get the organization chart and its actual dimensions
    const orgChart = this.chartContainer.querySelector('.organigrama');
    if (!orgChart) {
      this.chartContainer.style.transform = originalTransform;
      return;
    }

    // Use getBoundingClientRect for exact dimensions
    const orgRect = orgChart.getBoundingClientRect();
    const orgWidth = orgRect.width;
    const orgHeight = orgRect.height;

    // Calculate the exact central position
    const newTranslateX = Math.max(0, (containerWidth - (orgWidth * scale)) / 2);
    const newTranslateY = Math.max(0, (containerHeight - (orgHeight * scale)) / 2);

    // Update the position
    this.translateX = 0;
    this.translateY = 0;

    // Apply transformation with the exact central position and scale
    this.chartContainer.style.transform = `scale(${scale})`;

    // Prevent the user from dragging the organization chart out of visible bounds
    this.setupBoundaries();

    // Redraw connectors after centering
    setTimeout(() => this.redrawAllConnectors(), this.TIMEOUTS.CONNECTOR_REDRAW);
  }

  /**
   * Detect when the container resizes to re-center
   * This method is called automatically if a ResizeObserver is available
   */
  setupResizeObserver() {
    if (typeof ResizeObserver !== 'undefined') {
      // Create a resize observer for the container
      this.resizeObserver = new ResizeObserver(entries => {
        // Only interested in our container
        const entry = entries.find(e => e.target === this.container);
        if (entry) {
          // Handle the resize
          this.handleResize();
        }
      });

      // Start observing the container
      this.resizeObserver.observe(this.container);
    }

    // Also listen to the window resize event
    window.addEventListener('resize', () => this.handleResize());
  }

  /**
   * Centers the organization chart with a specific zoom level
   * @param {number} zoomLevel - Zoom level to apply
   */
  centerChartWithZoom(zoomLevel) {
    if (!this.chartContainer || !this.container) return;

    // Check for invalid values
    if (isNaN(zoomLevel) || zoomLevel <= 0) {
      // console.warn("Invalid zoom in centerChartWithZoom:", zoomLevel);
      zoomLevel = this.options.initialZoom;
    }

    // Update scale
    this.scale = zoomLevel;

    // Ensure connectors remain visible
    this.redrawAllConnectors();
  }

  /**
   * Processes the data to convert it into a hierarchical structure
   * Improved to handle data with possible duplicates or inconsistencies
   */
  processData() {
    const data = this.data.tree || this.data;

    // Step 1: Group nodes by name to detect possible duplicates
    const nodesByName = new Map();
    for (const node of data) {
      if (!nodesByName.has(node.name)) {
        nodesByName.set(node.name, []);
      }
      nodesByName.get(node.name).push(node);
    }

    // Step 2: Resolve duplicates and create main map
    const nodeMap = new Map();
    const duplicateLog = [];

    for (const [name, nodes] of nodesByName.entries()) {
      if (nodes.length > 1) {
        // There are duplicates, prioritize the one with children (pid appears as id of another node)
        let primaryNode = nodes[0];
        const childRefCount = new Map();

        // Count how many nodes have each ID as parent
        for (const node of data) {
          if (node.pid) {
            childRefCount.set(node.pid, (childRefCount.get(node.pid) || 0) + 1);
          }
        }

        // Find the node with the most children
        for (const node of nodes) {
          const childCount = childRefCount.get(node.id) || 0;
          const primaryChildCount = childRefCount.get(primaryNode.id) || 0;

          if (childCount > primaryChildCount) {
            primaryNode = node;
          }
        }

        // Log resolved duplicates for reference
        duplicateLog.push({
          name,
          selectedId: primaryNode.id,
          allIds: nodes.map(n => n.id)
        });

        // Only add the primary node to the map
        nodeMap.set(primaryNode.id, { ...primaryNode, children: [], level: 0 });
      } else {
        // No duplicates, add normally
        const node = nodes[0];
        nodeMap.set(node.id, { ...node, children: [], level: 0 });
      }
    }

    // Step 3: Build the hierarchy based on the clean map
    const rootNodes = [];

    // Traverse nodes to establish parent-child relationships
    for (const [id, node] of nodeMap.entries()) {
      if (node.pid && nodeMap.has(node.pid)) {
        // Has a valid parent
        const parentNode = nodeMap.get(node.pid);
        node.level = parentNode.level + 1;
        parentNode.children.push(node);
      } else {
        // It's a root node
        node.level = 0;
        rootNodes.push(node);
      }
    }

    // Sort nodes according to configuration
    this.sortNodes(rootNodes);

    // Log statistics for debugging
    console.debug(`Data processing: ${data.length} total nodes, ${nodeMap.size} unique nodes, ${rootNodes.length} root nodes, ${duplicateLog.length} resolved duplicates`);

    // Store processed data
    this.hierarchicalData = rootNodes;

    // Configure initial expansion
    this.configureInitialExpansion();
  }

  /**
   * Configure initial expansion state of nodes based on hierarchical level
   */
  configureInitialExpansion() {
    const configureExpansion = (nodes, level) => {
      nodes.forEach(node => {
        const expanded = this.options.initiallyExpanded || level < this.options.initialVisibleLevels;
        this.expandedNodes.set(node.id, expanded);

        if (node.children && node.children.length > 0) {
          configureExpansion(node.children, level + 1);
        }
      });
    };

    // Start from root nodes (level 0)
    configureExpansion(this.hierarchicalData, 0);
  }

  /**
   * Sorts the nodes in the tree according to the configured options
   * @param {Array} nodes - The nodes to sort
   */
  sortNodes(nodes) {
    if (!nodes || !nodes.length) return;

    // Sort by the specified field
    const sortField = this.options.sortBy;
    const isAscending = this.options.sortDirection === 'asc';

    nodes.sort((a, b) => {
      let valA = a[sortField] || '';
      let valB = b[sortField] || '';

      // Case-insensitive string comparisons
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return isAscending ? -1 : 1;
      if (valA > valB) return isAscending ? 1 : -1;
      return 0;
    });

    // Recursively sort children
    for (const node of nodes) {
      if (node.children && node.children.length) {
        this.sortNodes(node.children);
      }
    }
  }

  /**
   * Renders the entire organization chart
   */
  render() {
    // Clear the container
    this.container.innerHTML = '';

    // Apply style to keep content within bounds
    this.container.style.overflow = 'hidden';
    this.container.style.position = 'relative';

    // Apply minimum height if set
    if (this.options.minHeight) {
      this.container.style.minHeight = typeof this.options.minHeight === 'number'
        ? `${this.options.minHeight}px`
        : this.options.minHeight;
    }

    // Create main container for the organization chart with zoom and drag capability
    const chartContainer = document.createElement('div');
    chartContainer.className = 'org-chart-container';

    // Ensure the organization chart container takes up all available space
    chartContainer.style.width = '100%';
    chartContainer.style.height = '100%';
    chartContainer.style.position = 'absolute';

    this.chartContainer = chartContainer;

    // Create the hierarchical tree using UL/LI for better structure
    const orgChart = document.createElement('div');
    orgChart.className = 'organigrama';

    // Create the list of root nodes
    const rootList = document.createElement('ul');
    rootList.className = 'nodes';

    // Render nodes recursively using the UL/LI structure
    this.hierarchicalData.forEach(node => {
      const nodeElement = this.renderNodeUL(node, 1); // Start at level 1
      rootList.appendChild(nodeElement);
    });

    // Assemble the complete structure
    orgChart.appendChild(rootList);
    chartContainer.appendChild(orgChart);
    this.container.appendChild(chartContainer);

    // Create navigation controls (zoom, expand/collapse, etc.)
    this.createControls();

    // Adjust connection lines after rendering
    setTimeout(() => this.redrawAllConnectors(), this.TIMEOUTS.RENDER_CONNECTORS);
  }

  /**
   * Renders a node using UL/LI structure for better hierarchy
   * @param {Object} node - Node to render
   * @param {number} level - Hierarchical level of the node
   * @returns {HTMLElement} - LI element representing the node and its children
   */
  renderNodeUL(node, level) {
    // Create LI element for this node and its children
    const hierarchyItem = document.createElement('li');
    hierarchyItem.className = 'hierarchy';

    // Determine if the node is expanded
    const isExpanded = this.expandedNodes.get(node.id);

    // Mark if expanded or collapsed
    if (node.children && node.children.length > 0) {
      if (isExpanded) {
        hierarchyItem.classList.add('isOpen');
      } else {
        hierarchyItem.classList.add('isChildrenCollapsed');
      }

      // Add class for nodes with many children
      if (node.children.length > 3) {
        hierarchyItem.classList.add('multi-children');
      }
    }

    // Create the node itself
    const nodeDiv = document.createElement('div');
    nodeDiv.className = 'node';
    nodeDiv.id = node.id;
    nodeDiv.setAttribute('data-level', level);

    // Make the entire node clickable to expand/collapse
    if (node.children && node.children.length > 0) {
      nodeDiv.classList.add('clickable');
      nodeDiv.addEventListener('click', (e) => {
        // If the click was on the expand/collapse button, do nothing
        // as that event will be handled by the button's listener
        if (e.target.closest('.edge')) {
          return;
        }
        this.toggleNode(node.id);
      });
    }

    // Create the main content of the node
    const contentDiv = document.createElement('div');
    contentDiv.className = 'content';

    // Figure for the avatar
    const figure = document.createElement('figure');
    figure.className = 'mb-1';

    // If the node has an image, display it
    if (node.img) {
      // Create avatar with SVG for circular image support
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '80');
      svg.setAttribute('height', '80');
      svg.setAttribute('viewBox', '0 0 80 80');
      svg.style.display = 'block';

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

      // Create pattern for the image
      const patternId = `avatar-${node.id}`;
      const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
      pattern.setAttribute('id', patternId);
      pattern.setAttribute('width', '100%');
      pattern.setAttribute('height', '100%');
      pattern.setAttribute('patternUnits', 'userSpaceOnUse');

      const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', node.img);
      image.setAttribute('width', '80');
      image.setAttribute('height', '80');
      image.setAttribute('preserveAspectRatio', 'xMidYMid slice'); // Maintain aspect ratio and center
      image.setAttribute('x', '0');
      image.setAttribute('y', '0');

      // Handle 404 error for images not found
      image.addEventListener('error', () => {
        // Remove the image with error
        pattern.removeChild(image);

        // Replace with a text placeholder
        const fallbackGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');

        // Circular background in fill color
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', '40');
        circle.setAttribute('cy', '40');
        circle.setAttribute('r', '40');
        circle.setAttribute('fill', this.options.nodeColor || '#4ade80');

        // Text with initials - improved for perfect centering
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', '40');
        text.setAttribute('y', '40');  // Center at 40 instead of 48
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('alignment-baseline', 'central'); // Better property for vertical centering
        text.setAttribute('dominant-baseline', 'central'); // Compatibility with more browsers
        text.setAttribute('fill', 'white');
        text.setAttribute('font-size', '28');
        text.setAttribute('font-weight', 'bold');
        text.setAttribute('font-family', 'Arial, sans-serif'); // Ensure typographic consistency
        text.textContent = node.name.substring(0, 2).toUpperCase();

        fallbackGroup.appendChild(circle);
        fallbackGroup.appendChild(text);
        pattern.appendChild(fallbackGroup);
      });

      pattern.appendChild(image);

      // Create rectangle with the pattern
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', '0');
      rect.setAttribute('y', '0');
      rect.setAttribute('width', '80');
      rect.setAttribute('height', '80');
      rect.setAttribute('rx', '40'); // Radius to make it circular (half the width)
      rect.setAttribute('style', `fill: url(#${patternId});`);

      g.appendChild(pattern);
      g.appendChild(rect);
      svg.appendChild(g);
      figure.appendChild(svg);
    } else {
      // Placeholder for avatar if no image
      const avatarPlaceholder = document.createElement('div');
      avatarPlaceholder.className = 'avatar-placeholder';
      avatarPlaceholder.textContent = node.name.substring(0, 2).toUpperCase();
      figure.appendChild(avatarPlaceholder);
    }

    contentDiv.appendChild(figure);

    // Full name
    const namePara = document.createElement('p');
    namePara.className = 'c-name font-size-14 fw-600 mb-2';
    const nameSpan = document.createElement('span');
    nameSpan.title = node.name;
    nameSpan.textContent = node.name;
    namePara.appendChild(nameSpan);
    contentDiv.appendChild(namePara);

    // Job title
    const jobPara = document.createElement('p');
    jobPara.className = 'c-job font-size-12 fw-900 text-basic-700 mb-1';
    const jobSpan = document.createElement('span');
    jobSpan.title = node.title || '';
    jobSpan.textContent = node.title || '';
    jobPara.appendChild(jobSpan);
    contentDiv.appendChild(jobPara);

    // Add additional information if available
    if (node.department) {
      const deptPara = document.createElement('p');
      deptPara.className = 'font-size-12 fw-500 text-basic-700 mb-0';
      const deptSpan = document.createElement('span');
      deptSpan.title = node.department;
      deptSpan.textContent = node.department;
      deptPara.appendChild(deptSpan);
      contentDiv.appendChild(deptPara);
    }

    // Expand/collapse button if it has children
    if (node.children && node.children.length > 0) {
      // Add button to expand/collapse on the right side of the node
      const edgeIcon = document.createElement('i');
      edgeIcon.className = 'edge verticalEdge rightEdge oci ' +
                          (isExpanded ? 'oci-minus' : 'oci-plus');
      // Set up click event
      edgeIcon.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent click from propagating to the node
        this.toggleNode(node.id);
      });
      nodeDiv.appendChild(edgeIcon);
    }

    // Assemble the complete node
    nodeDiv.appendChild(contentDiv);
    hierarchyItem.appendChild(nodeDiv);

    // Render children if any and expanded
    if (node.children && node.children.length > 0) {
      const childrenList = document.createElement('ul');
      childrenList.className = 'nodes';

      // Hide if collapsed
      if (!isExpanded) {
        childrenList.classList.add('hidden');
      }

      // Render each child
      node.children.forEach((childNode, index) => {
        const childElement = this.renderNodeUL(childNode, level + 1);

        // Add special classes to edge elements for better alignment
        if (index === 0) {
          childElement.classList.add('first-child-node');
        }
        if (index === node.children.length - 1) {
          childElement.classList.add('last-child-node');
        }

        childrenList.appendChild(childElement);
      });

      hierarchyItem.appendChild(childrenList);
    }

    return hierarchyItem;
  }

  /**
   * Toggles the state of a node (expanded/collapsed)
   * @param {number|string} nodeId - ID of the node to toggle
   */
  toggleNode(nodeId) {
    // Change expansion state
    const currentState = this.expandedNodes.get(nodeId);
    const isExpanding = !currentState; // true if expanding, false if collapsing
    this.expandedNodes.set(nodeId, isExpanding);

    // Find the node element in the DOM
    const nodeElement = document.querySelector(`[id="${nodeId}"]`);
    if (!nodeElement) return;

    // Find the parent li element
    const hierarchyElement = nodeElement.closest('.hierarchy');
    if (!hierarchyElement) return;

    // Find the list of children
    const childrenList = hierarchyElement.querySelector('ul.nodes');
    if (!childrenList) return;

    // Save the size of the organization chart before changing the state
    const organigramaElem = this.chartContainer.querySelector('.organigrama');
    const orgSizeBefore = organigramaElem ?
      { width: organigramaElem.offsetWidth, height: organigramaElem.offsetHeight } :
      null;

    // Change the visual state
    if (currentState) { // Was expanded, now collapse
      hierarchyElement.classList.remove('isOpen');
      hierarchyElement.classList.add('isChildrenCollapsed');
      childrenList.classList.add('hidden');

      // Change button icon
      const edgeIcon = nodeElement.querySelector('.edge.rightEdge');
      if (edgeIcon) {
        edgeIcon.classList.remove('oci-minus');
        edgeIcon.classList.add('oci-plus');
      }
    } else { // Was collapsed, now expand
      hierarchyElement.classList.add('isOpen');
      hierarchyElement.classList.remove('isChildrenCollapsed');
      childrenList.classList.remove('hidden');

      // Change button icon
      const edgeIcon = nodeElement.querySelector('.edge.rightEdge');
      if (edgeIcon) {
        edgeIcon.classList.remove('oci-plus');
        edgeIcon.classList.add('oci-minus');
      }
    }

    // Wait for the DOM to fully update
    setTimeout(() => {
      // Redraw all connectors
      this.redrawAllConnectors();
      // The redrawAllConnectors method already calls _centerSingleVisibleNode

      // When collapsing nodes:
      // - Do not recalculate position to avoid abrupt movements
      // - Do not auto-center to avoid jumps
      if (isExpanding) {
        // If expanding, it may be necessary to reposition
        // to show the new content
        if (orgSizeBefore && organigramaElem) {
          const orgSizeAfter = {
            width: organigramaElem.offsetWidth,
            height: organigramaElem.offsetHeight
          };

          // Only if the size changed significantly, adjust the view
          if (orgSizeAfter.width > orgSizeBefore.width * 1.3 ||
              orgSizeAfter.height > orgSizeBefore.height * 1.3) {
            this.ensureChartIsVisible();
          }
        }
      }

      // Check if we should auto-center based on visible levels
      // This is now called after the DOM update is complete
      if (this.options.autoCenterLevels !== null &&
          this.options.autoCenterLevels > 0) {
        this.centerChartByVisibleLevels(this.options.autoCenterLevels);
      }
    }, this.TIMEOUTS.NODE_TOGGLE_UPDATE);
  }

  /**
   * Helper function to ensure the chart is visible
   * Modified to be less intrusive when collapsing a node
   */
  ensureChartIsVisible() {
    if (!this.chartContainer || !this.container) return;

    const containerRect = this.container.getBoundingClientRect();
    const organigramaElem = this.chartContainer.querySelector('.organigrama');
    if (!organigramaElem) return;

    const actualRect = organigramaElem.getBoundingClientRect();

    // If it's completely out of view or very close to the edge, adjust
    // but with a less aggressive approach than simply centering
    if (actualRect.right < 0 || actualRect.left > containerRect.width ||
        actualRect.bottom < 0 || actualRect.top > containerRect.height) {

      // Instead of fully centering, only adjust as needed to
      // ensure at least a significant part is visible
      let newTranslateX = this.translateX;
      let newTranslateY = this.translateY;

      // Adjust horizontally if needed
      if (actualRect.right < 50) { // Almost invisible to the left
        newTranslateX += (50 - actualRect.right);
      } else if (actualRect.left > containerRect.width - 50) { // Almost invisible to the right
        newTranslateX -= (actualRect.left - (containerRect.width - 50));
      }

      // Adjust vertically if needed
      if (actualRect.bottom < 50) { // Almost invisible above
        newTranslateY += (50 - actualRect.bottom);
      } else if (actualRect.top > containerRect.height - 50) { // Almost invisible below
        newTranslateY -= (actualRect.top - (containerRect.height - 50));
      }

      // Apply adjustments only if they actually changed
      if (newTranslateX !== this.translateX || newTranslateY !== this.translateY) {
        this.translateX = newTranslateX;
        this.translateY = newTranslateY;
        this.chartContainer.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
      }
    }
  }

  /**
   * Creates the navigation controls for the organization chart
   */
  createControls() {
    // Bottom controls (zoom)
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'org-controls';
    controlsContainer.style.position = 'absolute';
    controlsContainer.style.bottom = '10px';
    controlsContainer.style.right = '10px';
    controlsContainer.style.zIndex = '100';

    // Zoom controls
    const zoomControls = document.createElement('div');
    zoomControls.className = 'org-zoom-controls';

    // Zoom out button
    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.innerHTML = '−';
    zoomOutBtn.title = 'Zoom out';
    zoomOutBtn.className = 'org-zoom-out';
    zoomOutBtn.addEventListener('click', () => this.adjustZoom(-0.1));

    // Zoom in button
    const zoomInBtn = document.createElement('button');
    zoomInBtn.innerHTML = '+';
    zoomInBtn.title = 'Zoom in';
    zoomInBtn.className = 'org-zoom-in';
    zoomInBtn.addEventListener('click', () => this.adjustZoom(0.1));

    // Reset button
    const resetBtn = document.createElement('button');
    resetBtn.innerHTML = '↺';
    resetBtn.title = 'Reset view';
    resetBtn.className = 'org-reset';
    resetBtn.addEventListener('click', () => this.resetView());

    // Add buttons to the container
    zoomControls.appendChild(zoomOutBtn);
    zoomControls.appendChild(resetBtn);
    zoomControls.appendChild(zoomInBtn);

    // Add controls to the main container
    controlsContainer.appendChild(zoomControls);
    this.container.appendChild(controlsContainer);

    // Create fullscreen button (top right corner)
    this._createFullscreenButton();
  }

  /**
   * Creates the fullscreen button
   * @private
   */
  _createFullscreenButton() {
    // Create container for the fullscreen button
    const fullscreenContainer = document.createElement('div');
    fullscreenContainer.className = 'org-fullscreen-control';
    fullscreenContainer.style.position = 'absolute';
    fullscreenContainer.style.top = '10px';
    fullscreenContainer.style.right = '10px';
    fullscreenContainer.style.zIndex = '100';

    // Create fullscreen button
    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.title = 'Fullscreen';
    fullscreenBtn.className = 'org-fullscreen-btn';
    fullscreenBtn.innerHTML = '⛶'; // Fullscreen symbol
    fullscreenBtn.style.backgroundColor = '#fff';
    fullscreenBtn.style.border = '1px solid #ccc';
    fullscreenBtn.style.borderRadius = '3px';
    fullscreenBtn.style.padding = '5px 8px';
    fullscreenBtn.style.cursor = 'pointer';
    fullscreenBtn.style.fontSize = '16px';

    // Variable to track fullscreen state
    let isFullscreen = false;

    // Save original dimensions
    const originalStyle = {
      width: this.container.style.width,
      height: this.container.style.height,
      margin: this.container.style.margin,
      position: this.container.style.position,
      top: this.container.style.top,
      left: this.container.style.left,
      zIndex: this.container.style.zIndex
    };

    // Function to toggle fullscreen mode
    const toggleFullscreen = () => {
      if (!isFullscreen) {
        // Save current scroll position
        this._scrollPosition = {
          x: window.scrollX,
          y: window.scrollY
        };

        // Switch to fullscreen
        Object.assign(this.container.style, {
          position: 'fixed',
          width: '100%',
          height: '100%',
          top: '0',
          left: '0',
          margin: '0',
          zIndex: '9999',
          backgroundColor: this.options.fullscreenBgColor || '#fff',
          overflow: 'hidden'
        });

        // Prevent scrolling
        document.body.style.overflow = 'hidden';

        // Change button icon
        fullscreenBtn.innerHTML = '⮌'; // Exit fullscreen symbol
        fullscreenBtn.title = 'Exit fullscreen';

        // Recenter the organization chart in the new container
        setTimeout(() => this.forceCenterWithScale(this.scale), this.TIMEOUTS.FULLSCREEN_ADJUST);

        isFullscreen = true;
      } else {
        // Restore original dimensions
        Object.assign(this.container.style, originalStyle);

        // Restore scrolling
        document.body.style.overflow = '';

        // Restore scroll position
        if (this._scrollPosition) {
          window.scrollTo(this._scrollPosition.x, this._scrollPosition.y);
        }

        // Change button icon
        fullscreenBtn.innerHTML = '⛶';
        fullscreenBtn.title = 'Fullscreen';

        // Recenter the organization chart in the original container
        setTimeout(() => this.forceCenterWithScale(this.scale), this.TIMEOUTS.FULLSCREEN_ADJUST);

        isFullscreen = false;
      }

      // Handle resize
      this.handleResize();
    };

    // Add click event
    fullscreenBtn.addEventListener('click', toggleFullscreen);

    // Add keyboard event to exit with Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isFullscreen) {
        toggleFullscreen();
      }
    });

    // Add button to the container
    fullscreenContainer.appendChild(fullscreenBtn);
    this.container.appendChild(fullscreenContainer);
  }

  /**
   * Sets up zoom and drag controls for the organization chart
   */
  setupZoomControls() {
    // Initialize variables to track state
    this.scale = this.options.initialZoom;
    this.translateX = 0;
    this.translateY = 0;
    let isDragging = false;
    let lastX, lastY;

    // Function to apply transformation
    const applyTransform = () => {
      this.chartContainer.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
    };

    // Keep reference to context for use in event listeners
    const self = this;

    // Function to start dragging
    const startDrag = function(e) {
      // Prevent if right button or click on interactive elements
      if (e.button === 2 ||
          e.target.tagName === 'BUTTON' ||
          e.target.closest('.org-toggle-btn, button, select')) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      // Save initial position
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;

      // Change cursor
      document.body.style.cursor = 'grabbing';
      self.chartContainer.classList.add('dragging');
    };

    // Function to handle dragging
    const moveDrag = function(e) {
      if (!isDragging) return;

      e.preventDefault();
      e.stopPropagation();

      // Calculate displacement from last position
      const deltaX = e.clientX - lastX;
      const deltaY = e.clientY - lastY;

      // Calculate new position
      let newTranslateX = self.translateX + deltaX;
      let newTranslateY = self.translateY + deltaY;

      // Apply restriction to keep the organization chart visible
      // Prevent dragging too far left or right
      if (self.boundaries) {
        const minX = -self.boundaries.orgWidth + 100;  // Allow partial hiding, but not completely
        const maxX = self.boundaries.containerWidth - 100;  // Keep at least part visible
        newTranslateX = Math.min(maxX, Math.max(minX, newTranslateX));

        const minY = -self.boundaries.orgHeight + 100;  // Allow partial hiding, but not completely
        const maxY = self.boundaries.containerHeight - 100;  // Keep at least part visible
        newTranslateY = Math.min(maxY, Math.max(minY, newTranslateY));
      }

      // Update position
      self.translateX = newTranslateX;
      self.translateY = newTranslateY;

      // Save new position as last known
      lastX = e.clientX;
      lastY = e.clientY;

      // Apply transformation
      applyTransform();
    };

    // Function to end dragging
    const endDrag = function() {
      if (!isDragging) return;

      isDragging = false;
      document.body.style.cursor = '';
      self.chartContainer.classList.remove('dragging');
    };

    // Register mouse events
    this.chartContainer.addEventListener('mousedown', startDrag);
    window.addEventListener('mousemove', moveDrag);
    window.addEventListener('mouseup', endDrag);
    window.addEventListener('mouseleave', endDrag);

    // ===== TOUCH EVENT HANDLING =====

    // Function to start touch dragging
    const startTouchDrag = function(e) {
      if (e.touches.length !== 1 ||
          e.target.tagName === 'BUTTON' ||
          e.target.closest('.org-toggle-btn, button, select')) {
        return;
      }

      e.preventDefault();

      // Save initial position
      isDragging = true;
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;

      self.chartContainer.classList.add('dragging');
    };

    // Function to handle touch dragging
    const moveTouchDrag = function(e) {
      if (!isDragging || e.touches.length !== 1) return;

      e.preventDefault();

      // Calculate displacement
      const deltaX = e.touches[0].clientX - lastX;
      const deltaY = e.touches[0].clientY - lastY;

      // Update position considering current scale
      self.translateX += deltaX;
      self.translateY += deltaY;

      // Save new position
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;

      // Apply transformation
      applyTransform();
    };

    // Function to end touch dragging
    const endTouchDrag = function() {
      if (!isDragging) return;

      isDragging = false;
      self.chartContainer.classList.remove('dragging');
    };

    // Register touch events
    this.chartContainer.addEventListener('touchstart', startTouchDrag, { passive: false });
    window.addEventListener('touchmove', moveTouchDrag, { passive: false });
    window.addEventListener('touchend', endTouchDrag);
    window.addEventListener('touchcancel', endTouchDrag);

    // ===== WHEEL ZOOM HANDLING =====

    // Function to handle zoom with the wheel
    const handleWheel = function(e) {
      e.preventDefault();

      // Determine zoom direction
      const delta = e.deltaY > 0 ? -0.1 : 0.1;

      // Get mouse position relative to the container
      const rect = self.chartContainer.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Calculate mouse position in the chart space (unscaled)
      const mouseChartX = (mouseX - self.translateX) / self.scale;
      const mouseChartY = (mouseY - self.translateY) / self.scale;

      // Calculate new scale with limits
      const newScale = Math.max(0.1, Math.min(3, self.scale + delta));

      // Update scale
      self.scale = newScale;

      // Adjust translation to keep the point under the cursor
      self.translateX = mouseX - mouseChartX * newScale;
      self.translateY = mouseY - mouseChartY * newScale;

      // Apply transformation
      applyTransform();

      // Recalculate connection lines after applying zoom
      // Use debounce to improve performance
      clearTimeout(self.wheelZoomTimeout);
      self.wheelZoomTimeout = setTimeout(() => {
        self.redrawAllConnectors();
      }, self.TIMEOUTS.WHEEL_ZOOM_DEBOUNCE);
    };

    // Register wheel event
    this.container.addEventListener('wheel', handleWheel, { passive: false });

    // Add tabIndex to allow the container to receive focus
    this.chartContainer.tabIndex = 0;

    // No longer using setTimeout here, because now we call centerChartWithZoom
    // from initialize() with a longer delay to ensure everything is ready
  }

  /**
   * Centers the organization chart in the container
   */
  centerChart() {
    this.forceCenterWithScale(this.scale);
  }

  /**
   * Helper function to ensure the chart is visible
   */
  ensureChartIsVisible() {
    // Similar to centerChart but ensures at least part of the chart is visible
    if (!this.chartContainer || !this.container) return;

    const containerRect = this.container.getBoundingClientRect();
    const organigramaElem = this.chartContainer.querySelector('.organigrama');

    if (!organigramaElem) return;

    const actualRect = organigramaElem.getBoundingClientRect();

    // If it's completely out of view, center it
    if (actualRect.right < 0 || actualRect.left > containerRect.width ||
        actualRect.bottom < 0 || actualRect.top > containerRect.height) {
      this.forceCenterWithScale(this.scale);
    }
  }

  /**
   * Adjusts the zoom level
   * @param {number} delta - Change in zoom level
   */
  adjustZoom(delta) {
    if (!this.chartContainer) return;

    // Get dimensions
    const containerRect = this.container.getBoundingClientRect();
    const centerX = containerRect.width / 2;
    const centerY = containerRect.height / 2;

    // Calculate center position in the chart space unscaled
    const centerChartX = (centerX - this.translateX) / this.scale;
    const centerChartY = (centerY - this.translateY) / this.scale;

    // Calculate new scale
    const newScale = Math.max(0.1, Math.min(3, this.scale + delta));

    // Update scale
    this.scale = newScale;

    // Adjust translation to keep the central point
    this.translateX = centerX - centerChartX * newScale;
    this.translateY = centerY - centerChartY * newScale;

    // Apply transformation
    this.chartContainer.style.transform =
      `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;

    // Recalculate connection lines
    setTimeout(() => this.redrawAllConnectors(), 100); // Use redrawAllConnectors
  }

  /**
   * Resets the view to the initial state
   */
  resetView() {
    // Force centering with the initial scale
    this.forceCenterWithScale(this.options.initialZoom);

    // No additional redraw needed here as forceCenterWithScale already does it
  }

  /**
   * Automatically adjusts the zoom level to show the entire organization chart
   * with a reasonable margin
   */
  autoAdjustZoom() {
    if (!this.chartContainer || !this.container) return;

    // Get container dimensions
    const containerRect = this.container.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    // Get organization chart dimensions
    const organigramaElem = this.chartContainer.querySelector('.organigrama');
    if (!organigramaElem) return;
    const organigramaRect = organigramaElem.getBoundingClientRect();

    // Calculate actual size unscaled
    const realWidth = organigramaRect.width / this.scale;
    const realHeight = organigramaRect.height / this.scale;

    // Calculate zoom ratios needed to fit horizontally and vertically
    const horizontalZoom = (containerWidth - 40) / realWidth; // 40px margin
    const verticalZoom = (containerHeight - 40) / realHeight; // 40px margin

    // Use the most restrictive zoom (the smallest) to ensure everything is visible
    let newZoom = Math.min(horizontalZoom, verticalZoom);

    // Limit zoom to a reasonable range
    newZoom = Math.max(0.2, Math.min(newZoom, 1.5));

    // Apply the new zoom only if significantly different from the current one
    if (Math.abs(newZoom - this.scale) > 0.05) {
      // Calculate center of the organization chart
      const orgCenterX = (organigramaRect.left + organigramaRect.right) / 2;
      const orgCenterY = (organigramaRect.top + organigramaRect.bottom) / 2;

      // Calculate center of the container
      const containerCenterX = containerRect.left + containerWidth / 2;
      const containerCenterY = containerRect.top + containerHeight / 2;

      // Calculate displacement needed to center
      const deltaX = containerCenterX - orgCenterX;
      const deltaY = containerCenterY - orgCenterY;

      // Update scale and position
      this.scale = newZoom;

      // Calculate new translation to center the content
      this.translateX = deltaX + (this.translateX * newZoom / this.scale);
      this.translateY = deltaY + (this.translateY * newZoom / this.scale);

      // Apply the transformation
      this.chartContainer.style.transform =
        `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
    }
  }

  /**
   * Updates the organization chart with new data
   * @param {Object} newData - New data for the organization chart
   * @param {Object} [options] - Additional options
   */
  update(newData, options = null) {
    if (options) {
      this.options = { ...this.options, ...options };
    }

    this.data = newData;
    this.hierarchicalData = null;
    this.expandedNodes = new Map();
    this.initialize();

    // Automatically adjust zoom to show all content
    setTimeout(() => this.autoAdjustZoom(), this.TIMEOUTS.AUTO_ZOOM_ADJUST);
  }
/**
 * Redraws all connectors in the organization chart considering the scale
 */
redrawAllConnectors() {
  try {
    // 1. Remove all existing connectors to start clean
    document.querySelectorAll('.connector-line, .vert-connector, .parent-connector').forEach(conn => {
      conn.remove();
    });

    // 2. Process all nodes with exposed children
    const allExpandedParents = Array.from(document.querySelectorAll('.organigrama .hierarchy.isOpen'));
    allExpandedParents.forEach(parentNode => {
      // Create vertical connector for the parent
      this._createParentConnector(parentNode);

      // Get list of children
      const childrenList = parentNode.querySelector('ul.nodes');
      if (!childrenList || childrenList.classList.contains('hidden')) return;

      const children = Array.from(childrenList.querySelectorAll(':scope > li'));

      // Create vertical connectors for each child
      children.forEach(childNode => {
        this._createChildConnector(childNode);
      });

      // If there are multiple children, create horizontal connector
      if (children.length >= 2) {
        this._createHorizontalConnector(childrenList, children);
      }
    });

    // 3. Create vertical connectors for other child nodes that need connectors
    const allChildNodes = Array.from(document.querySelectorAll('.organigrama ul.nodes > li'));
    allChildNodes.forEach(node => {
      if (!node.querySelector('.vert-connector')) {
        this._createChildConnector(node);
      }
    });

    // 4. Check if there is only one visible node and center it in that case
    this._centerSingleVisibleNode();

  } catch (error) {
    console.error("Error in redrawAllConnectors:", error);
  }
}

/**
 * Checks if there is only one node visible in the organization chart and centers it
 * @private
 */
_centerSingleVisibleNode() {
  if (!this.chartContainer || !this.container) return;

  // Count visible nodes (not hidden)
  const visibleNodes = Array.from(
    this.chartContainer.querySelectorAll('.node')
  ).filter(node => {
    // A node is visible if itself and all its ancestors are visible
    let current = node;
    while (current && current !== this.chartContainer) {
      // If this element or any of its parents is hidden, the node is not visible
      if (current.classList.contains('hidden') ||
          window.getComputedStyle(current).display === 'none') {
        return false;
      }
      current = current.parentElement;
    }
    return true;
  });

  // If there's only one visible node, center it
  if (visibleNodes.length === 1) {
    const singleNode = visibleNodes[0];

    // Get dimensions of container and node
    const containerRect = this.container.getBoundingClientRect();
    const nodeRect = singleNode.getBoundingClientRect();

    // Calculate central position
    const containerCenterX = containerRect.width / 2;
    const containerCenterY = containerRect.height / 2;

    // Calculate current node position (considering scale)
    const nodeCenterX = nodeRect.left + nodeRect.width / 2 - containerRect.left;
    const nodeCenterY = nodeRect.top + nodeRect.height / 2 - containerRect.top;

    // Calculate displacement needed to center
    const deltaX = containerCenterX - nodeCenterX;
    const deltaY = containerCenterY - nodeCenterY;

    // If the node is significantly off-center, apply smooth centering
    if (Math.abs(deltaX) > 20 || Math.abs(deltaY) > 20) {
      // Using smooth transition for centering
      this.chartContainer.style.transition = 'transform 0.3s ease-out';

      // Update position maintaining scale
      this.translateX += deltaX;
      this.translateY += deltaY;

      // Apply transformation
      this.chartContainer.style.transform =
        `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;

      // Remove transition after completion
      setTimeout(() => {
        this.chartContainer.style.transition = '';
      }, 300);
    }
  }
}

/**
 * Creates a vertical connector for a child node
 * @param {HTMLElement} childNode - Child node
 * @private
 */
_createChildConnector(childNode) {
  try {
    const nodeDiv = childNode.querySelector('.node');
    if (!nodeDiv) return;

    // Check if this node really needs a vertical connector
    // A node doesn't need a connector if it's in a list without a visible parent node
    const parentList = childNode.closest('ul.nodes');
    if (!parentList) return;

    // If the parent node is not expanded or doesn't exist, don't show the vertical connector
    const parentHierarchy = parentList.closest('.hierarchy');
    const isParentVisible = parentHierarchy &&
                            !parentHierarchy.classList.contains('hidden') &&
                            parentHierarchy.classList.contains('isOpen');

    // For root nodes or when the parent is not visible, don't show the connector
    if (!parentHierarchy || !isParentVisible) {
      // If the node belongs to the root nodes list, don't create the connector
      const isRootNode = parentList.parentElement ===
                         this.chartContainer.querySelector('.organigrama');
      if (isRootNode) return;
    }

    const childConnector = document.createElement('div');
    childConnector.className = 'vert-connector';

    // Apply styles with CSS instead of calculations in JS
    Object.assign(childConnector.style, {
      position: 'absolute',
      width: '2px',
      backgroundColor: this.options.lineColor,
      height: '20px',
      top: '-20px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '1'
    });

    childNode.prepend(childConnector);
  } catch (error) {
    console.error("Error creating child connector:", error);
  }
}

/**
 * Creates a vertical connector for a parent node
 * @param {HTMLElement} parentNode - Expanded parent node
 * @private
 */
_createParentConnector(parentNode) {
  try {
    if (!parentNode || !parentNode.classList.contains('isOpen')) return;

    const nodeDiv = parentNode.querySelector('.node');
    if (!nodeDiv) return;

    const parentConnector = document.createElement('div');
    parentConnector.className = 'parent-connector';

    // Apply specific styles using CSS for better consistency
    Object.assign(parentConnector.style, {
      position: 'absolute',
      width: '2px',
      backgroundColor: this.options.lineColor,
      height: '10px',
      top: `${nodeDiv.offsetHeight}px`,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '1'
    });

    parentNode.appendChild(parentConnector);
} catch (error) {
    console.error("Error creating parent connector:", error);
  }
}

/**
 * Creates a horizontal connector between sibling nodes
 * @param {HTMLElement} childrenList - Container list of the children
 * @param {Array} children - Array of child nodes
 * @private
 */
_createHorizontalConnector(childrenList, children) {
  try {
    if (children.length < 2) return;

    // Instead of using getBoundingClientRect(), use offsetLeft and offsetWidth
    // which are not affected by scale
    const firstChild = children[0];
    const lastChild = children[children.length - 1];

    // Get the nodes to calculate positions
    const firstNodeDiv = firstChild.querySelector('.node');
    const lastNodeDiv = lastChild.querySelector('.node');

    if (!firstNodeDiv || !lastNodeDiv) return;

    // Calculate centers in unscaled space
    const firstChildLeft = firstChild.offsetLeft;
    const lastChildLeft = lastChild.offsetLeft;
    const firstChildWidth = firstChild.offsetWidth;
    const lastChildWidth = lastChild.offsetWidth;

    const firstCenter = firstChildLeft + (firstChildWidth / 2);
    const lastCenter = lastChildLeft + (lastChildWidth / 2);

    // Create the horizontal connector
    const connector = document.createElement('div');
    connector.className = 'connector-line';

    // Calculate position and width
    const startPos = Math.min(firstCenter, lastCenter);
    const endPos = Math.max(firstCenter, lastCenter);
    const width = endPos - startPos;

    // Apply styles with absolute positions
    Object.assign(connector.style, {
      position: 'absolute',
      height: '2px',
      backgroundColor: this.options.lineColor,
      width: `${width}px`,
      top: '-20px',
      left: `${startPos}px`,
      zIndex: '1'
    });

    childrenList.prepend(connector);
  } catch (error) {
    console.error("Error creating horizontal connector:", error);
  }
}

/**
 * Sets up boundaries to prevent the organization chart from being dragged out of view
 */
setupBoundaries() {
  // Save dimensions for validations during dragging
  if (!this.chartContainer || !this.container) return;

  const containerRect = this.container.getBoundingClientRect();
  const orgChart = this.chartContainer.querySelector('.organigrama');
  if (!orgChart) return;

  // Save dimensions for later use during dragging
  this.boundaries = {
    containerWidth: containerRect.width,
    containerHeight: containerRect.height,
    orgWidth: orgChart.getBoundingClientRect().width * this.scale,
    orgHeight: orgChart.getBoundingClientRect().height * this.scale
  };
}

/**
 * Handles window resize events
 */
handleResize() {
  // Recalculate boundaries
  this.setupBoundaries();

  // Center with current scale
  this.forceCenterWithScale(this.scale);
}

/**
 * Centers the chart if the number of visible levels matches the configured value
 * @param {number} levelCount - Number of visible levels to check for centering
 */
centerChartByVisibleLevels(levelCount) {
  if (!this.chartContainer || !this.container || !levelCount) return;

  // Get all visible nodes
  const visibleNodes = Array.from(
    this.chartContainer.querySelectorAll('.node')
  ).filter(node => {
    // A node is visible if itself and all its ancestors are visible
    let current = node;
    while (current && current !== this.chartContainer) {
      // If this element or any of its parents is hidden, the node is not visible
      if (current.classList.contains('hidden') ||
          window.getComputedStyle(current).display === 'none') {
        return false;
      }
      current = current.parentElement;
    }
    return true;
  });

  // Count unique visible levels
  const visibleLevels = new Set();
  visibleNodes.forEach(node => {
    const level = parseInt(node.getAttribute('data-level')) || 0;
    visibleLevels.add(level);
  });

  // If the number of visible levels matches our target, center the chart
  if (visibleLevels.size === levelCount) {
    // Calculate the bounds of all visible nodes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    visibleNodes.forEach(node => {
      const rect = node.getBoundingClientRect();
      minX = Math.min(minX, rect.left);
      minY = Math.min(minY, rect.top);
      maxX = Math.max(maxX, rect.right);
      maxY = Math.max(maxY, rect.bottom);
    });

    // Get container dimensions
    const containerRect = this.container.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    // Calculate center points
    const nodeCenterX = (minX + maxX) / 2;
    const nodeCenterY = (minY + maxY) / 2;

    const containerCenterX = containerRect.left + containerWidth / 2;
    const containerCenterY = containerRect.top + containerHeight / 2;

    // Calculate displacement needed to center
    const deltaX = containerCenterX - nodeCenterX;
    const deltaY = containerCenterY - nodeCenterY;

    // Update position maintaining scale
    this.chartContainer.style.transition = 'transform 0.3s ease-out';
    this.translateX += deltaX;
    this.translateY += deltaY;

    // Apply transformation
    this.chartContainer.style.transform =
      `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;

    // Remove transition after completion
    setTimeout(() => {
      this.chartContainer.style.transition = '';
    }, 300);
  }
}
}

// Export the class
if (typeof module !== 'undefined' && module.exports) {
  module.exports = HTMLOrgChart;
} else {
  window.HTMLOrgChart = HTMLOrgChart;
}
