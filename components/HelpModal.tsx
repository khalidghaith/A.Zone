import React from 'react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        backgroundColor: 'white', color: '#333', padding: '2rem',
        borderRadius: '8px', maxWidth: '800px', width: '90%',
        maxHeight: '90vh', overflowY: 'auto', position: 'relative',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
      }}>
        <button 
          onClick={onClose}
          style={{ 
            position: 'absolute', top: '1rem', right: '1rem', 
            border: 'none', background: 'none', fontSize: '1.5rem', 
            cursor: 'pointer', color: '#666' 
          }}
          aria-label="Close"
        >
          &times;
        </button>
        
        <h1 style={{ marginTop: 0, fontSize: '1.5rem', borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>
          SOAP - User Guide
        </h1>
        
        <div style={{ lineHeight: '1.6' }}>
          <p>SOAP is a web-based architectural programming and spatial layout tool. It allows designers to define a program of requirements, explore spatial relationships in a 2D canvas, and visualize the resulting massing in 3D.</p>

          <h3 style={{ fontWeight: 'bold', marginTop: '2rem', marginBottom: '1rem' }}>Features</h3>

          <h4 style={{ fontWeight: 'bold', marginTop: '1.5rem', marginBottom: '0.5rem' }}>1. Program Management</h4>
          <ul>
            <li><strong>Program Editor</strong>: Define spaces with names, target areas (m²), and zone categories.</li>
            <li><strong>CSV Import</strong>: Import room lists directly from CSV files (Format: Name, Area, Zone).</li>
            <li><strong>AI Program Generation</strong>: Generate a complete architectural program based on a project description using AI.</li>
            <li><strong>Zone Styling</strong>: Customize colors for different functional zones.</li>
          </ul>

          <h4 style={{ fontWeight: 'bold', marginTop: '1.5rem', marginBottom: '0.5rem' }}>2. 2D Spatial Layout (Canvas)</h4>
          <ul>
            <li><strong>Inventory System</strong>: Unplaced spaces reside in a sidebar inventory. Drag and drop them onto the canvas to place them.</li>
            <li><strong>Shape Flexibility</strong>: Switch space representations between:
              <ul>
                <li><strong>Rectangle</strong>: Standard box layout.</li>
                <li><strong>Polygon</strong>: Custom vertex-based shapes.</li>
                <li><strong>Bubble</strong>: Organic, circular shapes for conceptual diagrams.</li>
              </ul>
            </li>
            <li><strong>Multi-Floor Support</strong>: Create and manage multiple floors. View "ghosted" overlays of other floors to align vertical structures.</li>
            <li><strong>Snapping & Alignment</strong>: Snap to grid, snap to other objects, and magnetic physics mode.</li>
            <li><strong>Connections</strong>: Draw links between spaces to denote adjacency requirements or circulation paths.</li>
          </ul>

          <h4 style={{ fontWeight: 'bold', marginTop: '1.5rem', marginBottom: '0.5rem' }}>3. 3D Visualization (Volumes)</h4>
          <ul>
            <li><strong>Real-time Massing</strong>: Instantly view your 2D layout as extruded 3D volumes.</li>
            <li><strong>View Modes</strong>: Toggle between Perspective and Isometric views.</li>
            <li><strong>Vertical Stacking</strong>: Visualize how floors stack and relate vertically.</li>
            <li><strong>Export</strong>: Export the 3D model as an <code>.OBJ</code> file.</li>
          </ul>

          <h4 style={{ fontWeight: 'bold', marginTop: '1.5rem', marginBottom: '0.5rem' }}>4. Sketching & Annotation</h4>
          <ul>
            <li><strong>Drawing Tools</strong>: Integrated sketching toolbar with pen, line, arrow, and shape tools.</li>
            <li><strong>Dimensions</strong>: Add measurements and text notes directly to the layout.</li>
          </ul>

          <h4 style={{ fontWeight: 'bold', marginTop: '1.5rem', marginBottom: '0.5rem' }}>5. Reference Underlays</h4>
          <ul>
            <li><strong>Image Import</strong>: Import floor plans, site maps, or sketches (PNG/JPG).</li>
            <li><strong>Calibrated Scaling</strong>: Scale imported images to real-world dimensions.</li>
          </ul>

          <h4 style={{ fontWeight: 'bold', marginTop: '1.5rem', marginBottom: '0.5rem' }}>6. AI Assistance</h4>
          <ul>
            <li><strong>Generative Layout</strong>: Powered by Google Gemini, the app can suggest spatial arrangements based on your program data.</li>
          </ul>

          <h4 style={{ fontWeight: 'bold', marginTop: '1.5rem', marginBottom: '0.5rem' }}>7. Project Management</h4>
          <ul>
            <li><strong>Save/Load</strong>: Save projects locally as <code>.json</code> files.</li>
            <li><strong>Export</strong>: PDF reports, PNG screenshots, and CSV program data.</li>
          </ul>

          <hr style={{ margin: '2rem 0', border: '0', borderTop: '1px solid #eee' }} />

          <h3 style={{ fontWeight: 'bold', marginTop: '2rem', marginBottom: '1rem' }}>Controls & Shortcuts</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1rem', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
                <th style={{ padding: '8px' }}>Action</th>
                <th style={{ padding: '8px' }}>Shortcut / Control</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Pan Canvas', 'Middle Mouse Drag / Right Mouse Drag / Space + Left Drag'],
                ['Zoom', 'Mouse Wheel / Pinch Zoom (Touch)'],
                ['Undo', 'Ctrl + Z'],
                ['Redo', 'Ctrl + Y or Ctrl + Shift + Z'],
                ['Zoom to Fit', 'Ctrl + F'],
                ['Delete Selection', 'Delete or Backspace'],
                ['Switch Views', 'Tab (Cycles Editor -> Canvas -> Volumes)'],
                ['Multi-Select', 'Shift + Click or Drag Selection Box'],
              ].map(([action, shortcut], i) => (
                <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '8px' }}><strong>{action}</strong></td>
                  <td style={{ padding: '8px' }}>{shortcut}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <hr style={{ margin: '2rem 0', border: '0', borderTop: '1px solid #eee' }} />

          <h3 style={{ fontWeight: 'bold', marginTop: '2rem', marginBottom: '1rem' }}>Usage Guide</h3>

          <h4 style={{ fontWeight: 'bold', marginTop: '1.5rem', marginBottom: '0.5rem' }}>Starting a Project</h4>
          <p>Switch to the <strong>Program</strong> view to add spaces manually or import a CSV. Use the bottom bar to add floors.</p>

          <h4 style={{ fontWeight: 'bold', marginTop: '1.5rem', marginBottom: '0.5rem' }}>Layout Phase</h4>
          <p>Open the <strong>Inventory</strong> (left sidebar) and drag spaces onto the canvas. Use the <strong>Magnet</strong> tool to help pack bubbles organically. Select a space to open the <strong>Properties</strong> panel to change dimensions or shape type.</p>

          <h4 style={{ fontWeight: 'bold', marginTop: '1.5rem', marginBottom: '0.5rem' }}>Working with References</h4>
          <p>Click the <strong>Image Icon</strong> to enter Reference Mode. Upload an image and use the <strong>Ruler Icon</strong> to calibrate the scale by clicking two points and entering the real-world distance.</p>

          <h4 style={{ fontWeight: 'bold', marginTop: '1.5rem', marginBottom: '0.5rem' }}>3D Visualization</h4>
          <p>Switch to <strong>Volumes</strong> view to see the massing. Adjust floor heights in the Floor Settings to change extrusion heights.</p>
        </div>
      </div>
    </div>
  );
};