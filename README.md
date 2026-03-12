# ovos Sprint 🏃‍♂️‍➡️

Workload management and resource planning tool for IT project managers.

![ovos Sprint 🏃‍♂️‍➡️](https://img.shields.io/badge/version-1.1.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## Features

### Role-Based Access Control

- Admin role with full CRUD permissions
- User role with read-only access
- Invitation-based registration

### Team & Resource Management

- Create and manage teams
- Team members with customizable avatars
- Resource allocation across projects

### Project Management

- Projects with customer information
- Confirmed and tentative status types
- Many-to-many relationships between team members and projects

### Timeline View

- View by project or by team member
- Configurable zoom levels
- Day-by-day workload visualization
- Weekend and holiday highlighting
- Expandable/collapsible rows
- User preference persistence

### Drag-to-Assign (Admin Only)

- Click-and-drag interface for day assignments
- Multi-day selection
- Right-click or CTRL+click to delete
- Weekend/holiday assignment warnings

### Real-Time Updates

- WebSocket-based synchronization
- Instant updates across users

### UI Features

- Dark mode support
- Responsive layout
- Framer Motion animations

## Current Status & Limitations

### Language Support

- **UI Language**: English (hardcoded)
- **Date Formatting**: German locale (`de-AT`)
- **Internationalization**: Not currently implemented (see `TODO.md` for future plans)

### Testing

- **Test Coverage**: No automated tests currently configured
- **Planned**: Vitest + @testing-library/react (see `TODO.md`)

### Development Notes

- Application is production-ready for single-language deployment
- Multi-language support and comprehensive testing are planned future enhancements
- See `TODO.md` for complete feature roadmap

## Documentation

- **[Development Setup](DEVELOPMENT_SETUP.md)** - Quick start guide for local development
- **[Production Build Setup](PRODUCTION_BUILD_SETUP.md)** - Build and deployment instructions for production
- **[Architecture](ARCHITECTURE.md)** - Technical architecture, security features, API endpoints
- **[Branching Strategy](BRANCHING_STRATEGY.md)** - Git workflow and branching conventions
- **[Feature Roadmap](TODO.md)** - Planned features and enhancements

## Technology Stack

### Frontend

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui (Radix UI primitives)
- **State Management**: Zustand
- **Data Fetching**: TanStack Query (React Query)
- **Routing**: React Router v6
- **Date Handling**: date-fns
- **Real-Time**: Socket.IO Client
- **Icons**: Lucide React
- **Animations**: Framer Motion

### Backend

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: SQLite
- **ORM**: Drizzle ORM
- **Authentication**: JWT (JSON Web Tokens)
- **Password Hashing**: bcryptjs
- **Real-Time**: Socket.IO
- **Validation**: Zod
- **File Uploads**: Multer
- **Image Processing**: Sharp
- **Email**: Nodemailer with React Email templates
- **Security**: Helmet, CORS

### DevOps & Infrastructure

- **Containerization**: Docker
- **Reverse Proxy**: Caddy (development), Apache/nginx (production)
- **Orchestration**: Docker Compose
- **Database Migrations**: Drizzle Kit
- **Email Testing**: Mailpit (development SMTP server)

## Quick Start

For detailed setup instructions, see [DEVELOPMENT_SETUP.md](DEVELOPMENT_SETUP.md).

```bash
# Clone the repository
git clone https://github.com/rohschinken/ovos-sprint.git
cd ovos-sprint

# Install dependencies
npm run install:all

# Set up database
npm run db:setup

# Run development servers
npm run dev
```

The application will be available at:

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001

## Production Deployment

For production build and deployment instructions, see [PRODUCTION_BUILD_SETUP.md](PRODUCTION_BUILD_SETUP.md).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For issues, questions, or suggestions:

- **Email**: rohschinken@gmail.com
- **GitHub Issues**: [https://github.com/rohschinken/ovos-sprint/issues](https://github.com/rohschinken/ovos-sprint/issues)

_Last Updated: March 2026_
