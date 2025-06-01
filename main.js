let intervalId = null; // To potentially clear later if needed

// Module-level variable to store the signature of the last rendered comments.
let lastRenderedCommentsSignature = null;

async function fetchAndRenderComments(projectId, commentsContainer) {
  try {
    const response = await fetch(`/api/v1/projects/${projectId}/comments?sort_by=created_at&sort_order=desc&first=10`);
    if (!response.ok) {
      console.error(`HTTP error! status: ${response.status} - ${await response.text()}`);
      // Display a transient error or keep old content; for now, just log and return.
      // If the container was already cleared and this fetch fails, it might stay empty or show a generic error.
      // We can refine this by having a dedicated error display area.
      // For now, if fetch fails, we don't update the DOM, letting the previous state (or error) persist.
      return; 
    }
    const commentsCollection = await response.json();
    
    console.log('Raw API response for polling:', commentsCollection); // Debug log for polling

    let comments = [];
    if (commentsCollection && commentsCollection.comments && Array.isArray(commentsCollection.comments.data)) {
      comments = commentsCollection.comments.data
        .filter(item => item && item.comment) // Ensure item and item.comment exist
        .map(item => item.comment);
    } else {
      console.warn('Unexpected API response structure or missing comment data during poll:', commentsCollection);
      commentsContainer.innerHTML = '<p>Error: Could not parse comments data from API. Structure might have changed.</p>';
      return;
    }

    // Create a signature of the new comments using their id and created_at timestamp.
    // This helps in determining if the actual comment data has changed since the last render.
    const newCommentsSignature = JSON.stringify(comments.map(c => ({ 
        id: c.id, 
        created_at: c.created_at 
    })));

    // If the new signature matches the last rendered one, it means comments haven't changed.
    if (newCommentsSignature === lastRenderedCommentsSignature) {
      console.log('Comments data unchanged, skipping DOM update.');
      return; // Exit without re-rendering to prevent image reloads and unnecessary DOM manipulation.
    }
    
    console.log('Comments data changed or initial load, re-rendering.');
    lastRenderedCommentsSignature = newCommentsSignature; // Update the signature to the new state.

    // Clear "Loading..." or old comments *before* rendering new set
    // This ensures that if renderNestedComments has an issue, the container is at least cleared.
    commentsContainer.innerHTML = ''; 

    if (comments.length > 0) {
      renderNestedComments(comments, commentsContainer, 0); // Start with depth 0
    } else {
      commentsContainer.innerHTML = '<p>No comments found for this project.</p>';
    }
  } catch (error) {
    console.error('Error fetching or rendering comments:', error);
    // If an error occurs after clearing, display error in container.
    // This is a general catch-all.
    commentsContainer.innerHTML = `<p>Error loading comments: ${error.message}. Check console for more details.</p>`;
    // Reset signature on error so the next successful fetch will attempt a full render.
    lastRenderedCommentsSignature = null; 
  }
}

async function main() {
  try {
    const project = await window.websim.getCurrentProject();
    const commentsContainer = document.getElementById('comments-container');

    if (!project || !project.id) {
      commentsContainer.innerHTML = '<p>No project context found or project ID is missing.</p>';
      return;
    }
    
    // Set initial loading message. fetchAndRenderComments will replace this.
    commentsContainer.innerHTML = '<p>Loading comments...</p>'; 

    // Initial fetch
    await fetchAndRenderComments(project.id, commentsContainer);

    // Set up polling
    if (intervalId) { 
      clearInterval(intervalId);
    }
    intervalId = setInterval(() => {
      fetchAndRenderComments(project.id, commentsContainer);
    }, 7000);

  } catch (error) {
    console.error("Error in main initialization:", error);
    const commentsContainer = document.getElementById('comments-container');
    if (commentsContainer) {
        commentsContainer.innerHTML = '<p>Failed to initialize comment viewer. See console for details.</p>';
    }
  }
}

function renderNestedComments(commentsArray, parentDomElement, depth) {
  if (!commentsArray || commentsArray.length === 0) {
    return parentDomElement;
  }

  const currentComment = commentsArray[0];
  const remainingComments = commentsArray.slice(1);

  const commentDiv = document.createElement('div');
  commentDiv.className = 'comment-inception';
  
  // Deterministic background color based on depth
  const hues = [200, 220, 180, 160, 240, 140]; // Blues, Cyans, Greens, Purples - light pastel shades
  const hue = hues[depth % hues.length];
  commentDiv.style.backgroundColor = `hsl(${hue}, 70%, 95%)`;

  // Author info
  const authorDiv = document.createElement('div');
  authorDiv.className = 'comment-author';

  if (currentComment.author && currentComment.author.username) {
    const author = currentComment.author;
    const pfp = document.createElement('img');
    pfp.src = `https://images.websim.com/avatar/${author.username}`;
    pfp.alt = `${author.username}'s avatar`;
    pfp.className = 'author-pfp';
    authorDiv.appendChild(pfp);

    const usernameLink = document.createElement('a');
    usernameLink.href = `https://websim.com/@${author.username}`;
    usernameLink.textContent = `@${author.username}`;
    usernameLink.target = '_blank';
    authorDiv.appendChild(usernameLink);

    const timestamp = document.createElement('span');
    timestamp.textContent = `• ${new Date(currentComment.created_at).toLocaleString()}`;
    timestamp.className = 'timestamp';
    authorDiv.appendChild(timestamp);

  } else {
    authorDiv.textContent = 'Anonymous';
     const timestamp = document.createElement('span');
    timestamp.textContent = `• ${new Date(currentComment.created_at).toLocaleString()}`;
    timestamp.className = 'timestamp'; // Still show timestamp for anonymous
    authorDiv.appendChild(timestamp);
  }
  commentDiv.appendChild(authorDiv);

  // Comment content
  const contentDiv = document.createElement('div');
  contentDiv.className = 'comment-content';
  if (currentComment.content && currentComment.content.children && currentComment.content.children.length > 0) {
    currentComment.content.children.forEach(blockNode => {
      renderBlockContent(blockNode, contentDiv);
    });
  } else if (currentComment.raw_content) {
    const p = document.createElement('p');
    p.textContent = currentComment.raw_content;
    contentDiv.appendChild(p);
  } else {
    const p = document.createElement('p');
    p.textContent = '[Empty comment]';
    p.style.fontStyle = 'italic';
    contentDiv.appendChild(p);
  }
  commentDiv.appendChild(contentDiv);
  
  const nextCommentWrapper = document.createElement('div');
  nextCommentWrapper.className = 'next-comment-wrapper'; // Can be used for specific styling if needed
  commentDiv.appendChild(nextCommentWrapper);

  parentDomElement.appendChild(commentDiv);

  renderNestedComments(remainingComments, nextCommentWrapper, depth + 1); // Pass incremented depth
  
  return commentDiv;
}

function renderBlockContent(node, parentElement) {
  switch (node.type) {
    case 'paragraph':
      const p = document.createElement('p');
      if (node.children) {
        node.children.forEach(inlineNode => renderInlineContent(inlineNode, p));
      }
      parentElement.appendChild(p);
      break;
    case 'list':
      const list = document.createElement(node.ordered ? 'ol' : 'ul');
      if (node.ordered && node.start) {
        list.start = node.start;
      }
      if (node.children) {
        node.children.forEach(listItemNode => {
          const li = document.createElement('li');
          if (listItemNode.children && Array.isArray(listItemNode.children)) {
              listItemNode.children.forEach(blockNodeInListItem => renderBlockContent(blockNodeInListItem, li));
          }
          list.appendChild(li);
        });
      }
      parentElement.appendChild(list);
      break;
    case 'site_block':
      const siteBlockLink = document.createElement('a');
      siteBlockLink.href = node.url || `https://websim.com/c/${node.id}`;
      siteBlockLink.textContent = node.title || `Referenced Site: ${node.id}`;
      siteBlockLink.target = '_blank';
      siteBlockLink.className = 'block-link site-block-link';
      parentElement.appendChild(siteBlockLink);
      break;
    case 'project_block':
      const projectBlockLink = document.createElement('a');
      projectBlockLink.href = `https://websim.com/p/${node.id}`;
      projectBlockLink.textContent = `Referenced Project: ${node.id}`;
      projectBlockLink.target = '_blank';
      projectBlockLink.className = 'block-link project-block-link';
      parentElement.appendChild(projectBlockLink);
      break;
    case 'project_comment_block': // Handle comment mentions as blocks
        const commentBlockDiv = document.createElement('div');
        commentBlockDiv.className = 'block-link project-comment-block-link'; // Reuse styling
        commentBlockDiv.innerHTML = `Referenced Comment: <a href="https://websim.com/p/${node.project_id}#comment-${node.id}" target="_blank">${node.id}</a> (on project ${node.project_id})`;
        // If node.content exists for project_comment_block, it could be rendered recursively here.
        // For now, keeping it simple.
        parentElement.appendChild(commentBlockDiv);
        break;
    default:
      console.warn('Unsupported block content type:', node.type, node);
      const unknownBlock = document.createElement('div');
      unknownBlock.textContent = `[Unsupported block type: ${node.type}]`;
      unknownBlock.style.color = 'red';
      parentElement.appendChild(unknownBlock);
  }
}

function isImageUrl(url) {
  if (!url) return false;
  try {
    // Use window.location.origin as a base for potentially relative URLs,
    // though API URLs are typically absolute.
    const parsedUrl = new URL(url, window.location.origin);
    const path = parsedUrl.pathname.toLowerCase();
    return /\.(jpe?g|png|gif|webp|svg)$/.test(path);
  } catch (e) {
    // Invalid URL syntax
    console.warn('Invalid URL encountered in isImageUrl:', url, e);
    return false;
  }
}

function parseWebsimUrl(url) {
  if (!url) return null;
  try {
    // Use a base URL to handle relative paths correctly.
    // Assuming websim URLs will be absolute or root-relative from websim.com.
    const absoluteUrl = new URL(url, 'https://websim.com'); 
    
    if (absoluteUrl.hostname !== 'websim.com' && absoluteUrl.hostname !== 'www.websim.com') {
      return null; // Not a websim.com domain
    }

    const pathParts = absoluteUrl.pathname.split('/').filter(part => part !== ''); 

    if (pathParts.length === 0) return null; // e.g. https://websim.com/

    // Check for /@username/slug pattern (most specific with two parts)
    // Example: /@testuser/my-cool-project
    if (pathParts.length === 2 && pathParts[0].startsWith('@')) {
      const username = pathParts[0].substring(1);
      const slug = pathParts[1];
      if (/^[a-zA-Z0-9_]{3,32}$/.test(username) && /^[a-zA-Z0-9-]{3,50}$/.test(slug)) {
        return { type: 'slug', username: username, slug: slug, originalUrl: absoluteUrl.href };
      }
    }

    // Check for /p/project_id... pattern
    // Example: /p/project123, /p/project123/v/1
    if (pathParts[0] === 'p' && pathParts.length >= 2) {
      const projectId = pathParts[1];
      if (/^[a-z0-9_-]{20}$/.test(projectId)) {
        return { type: 'project', id: projectId, originalUrl: absoluteUrl.href };
      }
    }

    // Check for /c/site_id... pattern
    // Example: /c/siteABC, /c/siteABC/anything
    // Note: pathParts.length >= 2 ensures there's at least /c/SITE_ID
    if (pathParts[0] === 'c' && pathParts.length >= 2) {
      const siteId = pathParts[1];
      if (/^[a-zA-Z0-9]{17}$/.test(siteId)) {
        return { type: 'site', id: siteId, originalUrl: absoluteUrl.href };
      }
    }

  } catch (e) {
    // console.warn("Error parsing URL for websim check:", url, e);
    return null;
  }
  return null;
}

async function renderProjectDataOnCard(apiResponseData, originalLinkUrl, placeholderElement) {
  const { project, project_revision } = apiResponseData;

  if (!project || !project_revision) {
    placeholderElement.textContent = `Could not load details for the linked project.`;
    console.error(`Incomplete data for project (from URL ${originalLinkUrl}):`, apiResponseData);
    return;
  }

  const card = document.createElement('a');
  card.href = originalLinkUrl; // Use the original (potentially canonicalized) link URL
  card.target = '_blank';
  card.className = 'project-link-card';

  if (project_revision.current_screenshot_url) {
    const thumbnail = document.createElement('img');
    thumbnail.src = project_revision.current_screenshot_url;
    thumbnail.alt = project.title || `Thumbnail for project ${project.id}`;
    thumbnail.className = 'project-link-thumbnail';
    card.appendChild(thumbnail);
  } else {
    const noThumbnailDiv = document.createElement('div');
    noThumbnailDiv.className = 'project-link-thumbnail project-link-no-thumbnail';
    noThumbnailDiv.textContent = '🖼️'; // Default icon or text
    card.appendChild(noThumbnailDiv);
  }

  const infoDiv = document.createElement('div');
  infoDiv.className = 'project-link-info';

  const titleElement = document.createElement('h4');
  titleElement.className = 'project-link-title';
  titleElement.textContent = project.title || `Project: ${project.id}`;
  infoDiv.appendChild(titleElement);

  if (project.stats) {
    const statsElement = document.createElement('p');
    statsElement.className = 'project-link-stats';
    statsElement.textContent = `👁️ ${project.stats.views || 0}  ❤️ ${project.stats.likes || 0}  💬 ${project.stats.comments || 0}`;
    infoDiv.appendChild(statsElement);
  }
  
  if (project.description) {
      const descriptionElement = document.createElement('p');
      descriptionElement.className = 'project-link-description';
      const maxLength = 80;
      descriptionElement.textContent = project.description.length > maxLength ? project.description.substring(0, maxLength) + '...' : project.description;
      infoDiv.appendChild(descriptionElement);
  }

  card.appendChild(infoDiv);
  
  if (placeholderElement.parentNode) {
      placeholderElement.parentNode.replaceChild(card, placeholderElement);
  } else {
      console.warn("Placeholder for project card was detached before rendering card for:", originalLinkUrl);
  }
}


async function fetchProjectAndRenderCard(projectId, projectLinkUrl, placeholderElement) {
  try {
    const response = await fetch(`/api/v1/projects/${projectId}`);
    if (!response.ok) {
      placeholderElement.textContent = `Error loading project data: ${response.status}`;
      console.error(`Failed to fetch project ${projectId}: ${response.status}, ${await response.text()}`);
      return;
    }
    const data = await response.json();
    renderProjectDataOnCard(data, projectLinkUrl, placeholderElement);
  } catch (error) {
    placeholderElement.textContent = `Error processing project data.`;
    console.error(`Error fetching/rendering project card for ${projectId}:`, error);
  }
}

async function fetchProjectBySlugAndRenderCard(username, slug, originalLinkUrl, placeholderElement) {
  try {
    const response = await fetch(`/api/v1/users/${username}/slugs/${slug}`);
    if (!response.ok) {
      placeholderElement.textContent = `Error loading project data: ${response.status}`;
      console.error(`Failed to fetch project @${username}/${slug}: ${response.status}, ${await response.text()}`);
      return;
    }
    const data = await response.json();
    renderProjectDataOnCard(data, originalLinkUrl, placeholderElement);
  } catch (error) {
    placeholderElement.textContent = `Error processing project data.`;
    console.error(`Error fetching/rendering project card for @${username}/${slug}:`, error);
  }
}

function renderInlineContent(node, parentElement) {
  let element;
  switch (node.type) {
    case 'text':
      element = document.createElement('span');
      element.textContent = node.text;
      if (node.bold) element.style.fontWeight = 'bold';
      if (node.italic) element.style.fontStyle = 'italic';
      if (node.underline) element.style.textDecoration = node.strike ? 'underline line-through' : 'underline';
      else if (node.strike) element.style.textDecoration = 'line-through';
      parentElement.appendChild(element);
      break;
    case 'break':
      parentElement.appendChild(document.createElement('br'));
      break;
    case 'link':
      if (isImageUrl(node.url)) {
        // If the link URL is an image, render it as an <img> tag
        const img = document.createElement('img');
        img.src = node.url;

        let altText = '';
        if (node.children && node.children.length > 0) {
          node.children.forEach(child => {
            if (child.type === 'text') altText += child.text + ' ';
          });
        }
        altText = altText.trim();
        img.alt = altText || ('Linked image: ' + (node.url.substring(node.url.lastIndexOf('/') + 1) || node.url));
        
        img.className = 'content-image';
        parentElement.appendChild(img);

        if (node.children && node.children.length > 0) {
          const captionDiv = document.createElement('div');
          captionDiv.className = 'iframe-caption'; 
          
          node.children.forEach(childNode => {
            if (childNode.type === 'image') {
              if (childNode.alt && childNode.alt.trim() !== '') {
                const textSpan = document.createElement('span');
                textSpan.textContent = childNode.alt;
                captionDiv.appendChild(textSpan);
              }
            } else if (childNode.type === 'link' && isImageUrl(childNode.url)) {
              if (childNode.children) {
                childNode.children.forEach(grandChildNode => {
                  if (grandChildNode.type === 'text' || grandChildNode.type === 'break') {
                    renderInlineContent(grandChildNode, captionDiv);
                  }
                });
              }
            } else {
              renderInlineContent(childNode, captionDiv);
            }
          });
          
          const captionText = captionDiv.textContent.trim();
          const captionHTML = captionDiv.innerHTML.trim();

          let showCaption = false;
          if (captionHTML) { 
            if (captionText !== img.alt || (captionText === '' && captionHTML !== img.alt && captionHTML !== '')) {
               showCaption = true;
            }
          }

          if (showCaption) {
            parentElement.appendChild(captionDiv);
          }
        }
      } else {
        // Handle non-image URLs
        const websimInfo = parseWebsimUrl(node.url);

        if (websimInfo && websimInfo.type === 'project') {
          const projectCardPlaceholder = document.createElement('div');
          projectCardPlaceholder.className = 'project-link-card-placeholder';
          projectCardPlaceholder.textContent = `Loading Websim Project: ${websimInfo.id}...`;
          parentElement.appendChild(projectCardPlaceholder);
          // Asynchronously fetch and render the project card
          fetchProjectAndRenderCard(websimInfo.id, websimInfo.originalUrl, projectCardPlaceholder);

        } else if (websimInfo && websimInfo.type === 'slug') {
          const projectCardPlaceholder = document.createElement('div');
          projectCardPlaceholder.className = 'project-link-card-placeholder';
          projectCardPlaceholder.textContent = `Loading Websim Project: @${websimInfo.username}/${websimInfo.slug}...`;
          parentElement.appendChild(projectCardPlaceholder);
          fetchProjectBySlugAndRenderCard(websimInfo.username, websimInfo.slug, websimInfo.originalUrl, projectCardPlaceholder);
        
        } else if (websimInfo && websimInfo.type === 'site') {
          // Render as a simple styled link for Websim sites
          const siteLinkElement = document.createElement('a');
          siteLinkElement.href = websimInfo.originalUrl; // Use the canonical URL
          siteLinkElement.target = '_blank';
          
          let linkTextContent = '';
          // Try to use node children for link text
          if (node.children && node.children.length > 0) {
            const tempContainer = document.createElement('span'); // Use span for inline rendering
            node.children.forEach(childNode => renderInlineContent(childNode, tempContainer));
            linkTextContent = tempContainer.textContent.trim();
          }
          
          // If linkTextContent is empty or it's just the URL itself, use a default.
          const displayUrl = websimInfo.originalUrl || node.url;
          if (!linkTextContent || linkTextContent.toLowerCase() === displayUrl.toLowerCase()) {
            linkTextContent = `Websim Site: ${websimInfo.id}`;
          }
          siteLinkElement.textContent = linkTextContent;

          // Apply common link styles
          if (node.bold) siteLinkElement.style.fontWeight = 'bold';
          if (node.italic) siteLinkElement.style.fontStyle = 'italic';
          if (node.underline) siteLinkElement.style.textDecoration = node.strike ? 'underline line-through' : 'underline';
          else if (node.strike) siteLinkElement.style.textDecoration = 'line-through';
          
          parentElement.appendChild(siteLinkElement);

        } else {
          // URL is not an image, not a recognized Websim project/site/slug URL, or is external.
          // According to prompt "if its out of websim do not render the url at all", so do nothing here.
          // console.log(`Skipping URL (not image, not recognized Websim, or external): ${node.url}`);
        }
      }
      break;
    case 'image':
      const img = document.createElement('img');
      img.src = node.url;
      img.alt = node.alt || 'User image';
      img.className = 'content-image';
      parentElement.appendChild(img);
      break;
    case 'user':
      const userSpan = document.createElement('span');
      userSpan.className = 'user-mention';
      if (node.username) {
        const userPfp = document.createElement('img');
        userPfp.src = `https://images.websim.com/avatar/${node.username}`;
        userPfp.alt = `${node.username}'s avatar`;
        userPfp.className = 'mention-pfp';
        userSpan.appendChild(userPfp);
        
        const userLink = document.createElement('a');
        userLink.href = `https://websim.com/@${node.username}`;
        userLink.textContent = `@${node.username}`;
        userLink.target = '_blank';
        userSpan.appendChild(userLink);
      } else {
        userSpan.textContent = "@unknown_user";
      }
      
      if (node.bold) userSpan.style.fontWeight = 'bold';
      if (node.italic) userSpan.style.fontStyle = 'italic';
      if (node.underline) userSpan.style.textDecoration = node.strike ? 'underline line-through' : 'underline';
      else if (node.strike) userSpan.style.textDecoration = 'line-through';
      parentElement.appendChild(userSpan);
      break;
    case 'site':
      const siteLink = document.createElement('a');
      siteLink.href = node.url || `https://websim.com/c/${node.id}`;
      siteLink.textContent = node.title || `Site: ${node.id}`;
      siteLink.target = '_blank';
      if (node.bold) siteLink.style.fontWeight = 'bold';
      if (node.italic) siteLink.style.fontStyle = 'italic';
      if (node.underline) siteLink.style.textDecoration = node.strike ? 'underline line-through' : 'underline';
      else if (node.strike) siteLink.style.textDecoration = 'line-through';
      parentElement.appendChild(siteLink);
      break;
    case 'project':
      const projectLink = document.createElement('a');
      projectLink.href = `https://websim.com/p/${node.id}`;
      projectLink.textContent = `Project: ${node.id}`;
      projectLink.target = '_blank';
      if (node.bold) projectLink.style.fontWeight = 'bold';
      if (node.italic) projectLink.style.fontStyle = 'italic';
      if (node.underline) projectLink.style.textDecoration = node.strike ? 'underline line-through' : 'underline';
      else if (node.strike) projectLink.style.textDecoration = 'line-through';
      parentElement.appendChild(projectLink);
      break;
    case 'project_comment': // Handle inline comment mentions
        const commentLink = document.createElement('a');
        commentLink.href = `https://websim.com/p/${node.project_id}#comment-${node.id}`; // Example link structure
        commentLink.textContent = `Comment: ${node.id}`;
        commentLink.target = '_blank';
        // Apply text styles if any
        if (node.bold) commentLink.style.fontWeight = 'bold';
        if (node.italic) commentLink.style.fontStyle = 'italic';
        if (node.underline) commentLink.style.textDecoration = node.strike ? 'underline line-through' : 'underline';
        else if (node.strike) commentLink.style.textDecoration = 'line-through';
        parentElement.appendChild(commentLink);
        break;
    default:
      console.warn('Unsupported inline content type:', node.type, node);
      const unknownInline = document.createElement('span');
      unknownInline.textContent = `[Unsupported inline type: ${node.type}]`;
      unknownInline.style.color = 'red';
      parentElement.appendChild(unknownInline);
  }
}

document.addEventListener('DOMContentLoaded', main);